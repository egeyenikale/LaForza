import { expect } from "chai";
import { keccak256, toUtf8Bytes } from "ethers";
import { network } from "hardhat";

const { ethers } = await network.create();

const authorizationTypes = {
  DealAuthorization: [
    { name: "dealId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "player", type: "address" },
    { name: "token", type: "address" },
    { name: "totalAmount", type: "uint256" },
    { name: "signingBonus", type: "uint256" },
    { name: "milestoneRoot", type: "bytes32" },
    { name: "fundingDeadline", type: "uint64" },
    { name: "settlementDeadline", type: "uint64" },
  ],
};

describe("DeadlineEscrow", function () {
  async function deployFixture() {
    const signers = await ethers.getSigners();
    if (signers.length < 5) throw new Error("Expected five local signers");
    const [buyer, seller, player, verifier, relayer] = signers as [
      (typeof signers)[number],
      (typeof signers)[number],
      (typeof signers)[number],
      (typeof signers)[number],
      (typeof signers)[number],
    ];
    const token = await ethers.deployContract("MockUSDT");
    const latestBlock = await ethers.provider.getBlock("latest");
    const fundingDeadline = BigInt(latestBlock!.timestamp + 3_600);
    const settlementDeadline = fundingDeadline + 86_400n;
    const dealId = keccak256(toUtf8Bytes("laforza-demo-deal"));
    const milestoneId = keccak256(toUtf8Bytes("appearance-10"));
    const signingBonus = 250_000_000n;
    const milestoneAmount = 750_000_000n;
    const totalAmount = signingBonus + milestoneAmount;
    const milestoneInputs = [
      {
        id: milestoneId,
        threshold: 10,
        amount: milestoneAmount,
        beneficiary: seller.address,
      },
    ];
    const escrow = await ethers.deployContract("DeadlineEscrow", [
      await token.getAddress(),
      buyer.address,
      seller.address,
      player.address,
      verifier.address,
      dealId,
      totalAmount,
      signingBonus,
      fundingDeadline,
      settlementDeadline,
      milestoneInputs,
    ]);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = {
      name: "LaForza Deadline",
      version: "1",
      chainId,
      verifyingContract: await escrow.getAddress(),
    };
    const message = {
      dealId,
      buyer: buyer.address,
      seller: seller.address,
      player: player.address,
      token: await token.getAddress(),
      totalAmount,
      signingBonus,
      milestoneRoot: await escrow.milestoneRoot(),
      fundingDeadline,
      settlementDeadline,
    };

    return {
      buyer,
      seller,
      player,
      verifier,
      relayer,
      token,
      escrow,
      dealId,
      milestoneId,
      totalAmount,
      signingBonus,
      milestoneAmount,
      domain,
      message,
    };
  }

  it("requires all three signatures, funds once, and releases deterministic payouts", async function () {
    const fixture = await deployFixture();
    const buyerSignature = await fixture.buyer.signTypedData(
      fixture.domain,
      authorizationTypes,
      fixture.message,
    );
    const sellerSignature = await fixture.seller.signTypedData(
      fixture.domain,
      authorizationTypes,
      fixture.message,
    );
    const playerSignature = await fixture.player.signTypedData(
      fixture.domain,
      authorizationTypes,
      fixture.message,
    );

    await fixture.token.mint(fixture.buyer.address, fixture.totalAmount);
    await fixture.token
      .connect(fixture.buyer)
      .approve(await fixture.escrow.getAddress(), fixture.totalAmount);

    await expect(
      fixture.escrow
        .connect(fixture.relayer)
        .fund(buyerSignature, sellerSignature, playerSignature),
    )
      .to.emit(fixture.escrow, "DealFunded")
      .withArgs(fixture.dealId, fixture.buyer.address, fixture.totalAmount);

    expect(await fixture.token.balanceOf(fixture.player.address)).to.equal(
      fixture.signingBonus,
    );
    expect(await fixture.escrow.remainingAmount()).to.equal(
      fixture.milestoneAmount,
    );

    const evidenceHash = keccak256(toUtf8Bytes("signed appearance report"));
    await expect(
      fixture.escrow
        .connect(fixture.verifier)
        .releaseMilestone(fixture.milestoneId, evidenceHash),
    )
      .to.emit(fixture.escrow, "MilestoneReleased")
      .withArgs(
        fixture.milestoneId,
        fixture.seller.address,
        fixture.milestoneAmount,
        evidenceHash,
      );

    expect(await fixture.token.balanceOf(fixture.seller.address)).to.equal(
      fixture.milestoneAmount,
    );
    expect(await fixture.escrow.remainingAmount()).to.equal(0n);
  });

  it("rejects a signature that does not belong to the required player", async function () {
    const fixture = await deployFixture();
    const buyerSignature = await fixture.buyer.signTypedData(
      fixture.domain,
      authorizationTypes,
      fixture.message,
    );
    const sellerSignature = await fixture.seller.signTypedData(
      fixture.domain,
      authorizationTypes,
      fixture.message,
    );

    await fixture.token.mint(fixture.buyer.address, fixture.totalAmount);
    await fixture.token
      .connect(fixture.buyer)
      .approve(await fixture.escrow.getAddress(), fixture.totalAmount);

    await expect(
      fixture.escrow
        .connect(fixture.relayer)
        .fund(buyerSignature, sellerSignature, sellerSignature),
    )
      .to.be.revertedWithCustomError(fixture.escrow, "InvalidSignature")
      .withArgs(fixture.player.address);
  });

  it("allows only the named verifier to release a milestone", async function () {
    const fixture = await deployFixture();

    await expect(
      fixture.escrow
        .connect(fixture.seller)
        .releaseMilestone(
          fixture.milestoneId,
          keccak256(toUtf8Bytes("evidence")),
        ),
    ).to.be.revertedWithCustomError(fixture.escrow, "NotVerifier");
  });

  it("returns unreleased funds to the buyer after the settlement window", async function () {
    const fixture = await deployFixture();
    const signatures = await Promise.all(
      [fixture.buyer, fixture.seller, fixture.player].map((signer) =>
        signer.signTypedData(
          fixture.domain,
          authorizationTypes,
          fixture.message,
        ),
      ),
    );

    await fixture.token.mint(fixture.buyer.address, fixture.totalAmount);
    await fixture.token
      .connect(fixture.buyer)
      .approve(await fixture.escrow.getAddress(), fixture.totalAmount);
    await fixture.escrow
      .connect(fixture.relayer)
      .fund(signatures[0]!, signatures[1]!, signatures[2]!);

    const refundTimestamp =
      Number(await fixture.escrow.settlementDeadline()) + 1;
    await ethers.provider.send("evm_setNextBlockTimestamp", [refundTimestamp]);
    await ethers.provider.send("evm_mine", []);

    await expect(fixture.escrow.connect(fixture.buyer).refundRemainder())
      .to.emit(fixture.escrow, "RemainderRefunded")
      .withArgs(fixture.buyer.address, fixture.milestoneAmount);

    expect(await fixture.token.balanceOf(fixture.buyer.address)).to.equal(
      fixture.milestoneAmount,
    );
    expect(await fixture.escrow.remainingAmount()).to.equal(0n);
  });
});
