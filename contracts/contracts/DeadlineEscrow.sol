// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DEADLINE escrow for a single football deal
/// @notice Requires buyer, seller, and player approval of identical EIP-712 terms.
/// @dev Local WDK policy guards signing; this contract independently guards custody.
contract DeadlineEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct MilestoneInput {
        bytes32 id;
        uint64 threshold;
        uint128 amount;
        address beneficiary;
    }

    struct Milestone {
        uint64 threshold;
        uint128 amount;
        address beneficiary;
        bool released;
    }

    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256(
        "DealAuthorization(bytes32 dealId,address buyer,address seller,address player,address token,uint256 totalAmount,uint256 signingBonus,bytes32 milestoneRoot,uint64 fundingDeadline,uint64 settlementDeadline)"
    );
    uint8 public constant SIGNATURE_SCHEME_VERSION = 2;

    IERC20 public immutable token;
    address public immutable buyer;
    address public immutable seller;
    address public immutable player;
    address public immutable verifier;
    bytes32 public immutable dealId;
    bytes32 public immutable milestoneRoot;
    uint256 public immutable totalAmount;
    uint256 public immutable signingBonus;
    uint64 public immutable fundingDeadline;
    uint64 public immutable settlementDeadline;

    bool public funded;
    uint256 public releasedAmount;

    mapping(bytes32 id => Milestone milestone) public milestones;
    bytes32[] private _milestoneIds;

    error AmountInvariant();
    error AlreadyFunded();
    error DealExpired();
    error DuplicateMilestone(bytes32 id);
    error InvalidAddress();
    error InvalidDeadline();
    error InvalidEvidence();
    error InvalidSignature(address expectedSigner);
    error MilestoneAlreadyReleased(bytes32 id);
    error MilestoneNotFound(bytes32 id);
    error NotBuyer();
    error NotFunded();
    error NotVerifier();
    error SettlementClosed();
    error SettlementStillActive();

    event DealFunded(bytes32 indexed dealId, address indexed buyer, uint256 amount);
    event SigningBonusReleased(address indexed player, uint256 amount);
    event MilestoneReleased(
        bytes32 indexed milestoneId,
        address indexed beneficiary,
        uint256 amount,
        bytes32 evidenceHash
    );
    event RemainderRefunded(address indexed buyer, uint256 amount);

    constructor(
        IERC20 token_,
        address buyer_,
        address seller_,
        address player_,
        address verifier_,
        bytes32 dealId_,
        uint256 totalAmount_,
        uint256 signingBonus_,
        uint64 fundingDeadline_,
        uint64 settlementDeadline_,
        MilestoneInput[] memory milestoneInputs
    ) EIP712("LaForza Deadline", "1") {
        if (
            address(token_) == address(0) || buyer_ == address(0) || seller_ == address(0)
                || player_ == address(0) || verifier_ == address(0)
        ) revert InvalidAddress();
        if (
            fundingDeadline_ <= block.timestamp || settlementDeadline_ <= fundingDeadline_
        ) revert InvalidDeadline();
        if (totalAmount_ == 0 || signingBonus_ > totalAmount_) revert AmountInvariant();

        token = token_;
        buyer = buyer_;
        seller = seller_;
        player = player_;
        verifier = verifier_;
        dealId = dealId_;
        totalAmount = totalAmount_;
        signingBonus = signingBonus_;
        fundingDeadline = fundingDeadline_;
        settlementDeadline = settlementDeadline_;
        milestoneRoot = keccak256(abi.encode(milestoneInputs));

        uint256 committed = signingBonus_;
        for (uint256 i = 0; i < milestoneInputs.length; ++i) {
            MilestoneInput memory input = milestoneInputs[i];
            if (
                input.id == bytes32(0) || input.amount == 0 || input.threshold == 0
                    || input.beneficiary == address(0)
            ) revert AmountInvariant();
            if (milestones[input.id].beneficiary != address(0)) {
                revert DuplicateMilestone(input.id);
            }

            milestones[input.id] = Milestone({
                threshold: input.threshold,
                amount: input.amount,
                beneficiary: input.beneficiary,
                released: false
            });
            _milestoneIds.push(input.id);
            committed += input.amount;
        }

        if (committed != totalAmount_) revert AmountInvariant();
    }

    function authorizationDigest() public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                AUTHORIZATION_TYPEHASH,
                dealId,
                buyer,
                seller,
                player,
                address(token),
                totalAmount,
                signingBonus,
                milestoneRoot,
                fundingDeadline,
                settlementDeadline
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function fund(
        bytes calldata buyerSignature,
        bytes calldata sellerSignature,
        bytes calldata playerSignature
    ) external nonReentrant {
        if (msg.sender != buyer) revert NotBuyer();
        if (funded) revert AlreadyFunded();
        if (block.timestamp > fundingDeadline) revert DealExpired();

        bytes32 digest = authorizationDigest();
        if (!_isValidSigner(buyer, digest, buyerSignature)) {
            revert InvalidSignature(buyer);
        }
        if (!_isValidSigner(seller, digest, sellerSignature)) {
            revert InvalidSignature(seller);
        }
        if (!_isValidSigner(player, digest, playerSignature)) {
            revert InvalidSignature(player);
        }

        funded = true;
        releasedAmount = signingBonus;
        token.safeTransferFrom(buyer, address(this), totalAmount);

        emit DealFunded(dealId, buyer, totalAmount);
        if (signingBonus != 0) {
            token.safeTransfer(player, signingBonus);
            emit SigningBonusReleased(player, signingBonus);
        }
    }

    function releaseMilestone(bytes32 milestoneId, bytes32 evidenceHash)
        external
        nonReentrant
    {
        if (msg.sender != verifier) revert NotVerifier();
        if (!funded) revert NotFunded();
        if (block.timestamp > settlementDeadline) revert SettlementClosed();
        if (evidenceHash == bytes32(0)) revert InvalidEvidence();

        Milestone storage milestone = milestones[milestoneId];
        if (milestone.beneficiary == address(0)) revert MilestoneNotFound(milestoneId);
        if (milestone.released) revert MilestoneAlreadyReleased(milestoneId);
        if (releasedAmount + milestone.amount > totalAmount) revert SettlementClosed();

        milestone.released = true;
        releasedAmount += milestone.amount;
        token.safeTransfer(milestone.beneficiary, milestone.amount);

        emit MilestoneReleased(
            milestoneId, milestone.beneficiary, milestone.amount, evidenceHash
        );
    }

    function refundRemainder() external nonReentrant {
        if (msg.sender != buyer) revert NotBuyer();
        if (!funded) revert NotFunded();
        if (block.timestamp <= settlementDeadline) revert SettlementStillActive();

        uint256 remainder = totalAmount - releasedAmount;
        if (remainder == 0) revert SettlementClosed();
        releasedAmount = totalAmount;
        token.safeTransfer(buyer, remainder);

        emit RemainderRefunded(buyer, remainder);
    }

    function remainingAmount() external view returns (uint256) {
        return totalAmount - releasedAmount;
    }

    function milestoneCount() external view returns (uint256) {
        return _milestoneIds.length;
    }

    function milestoneIdAt(uint256 index) external view returns (bytes32) {
        return _milestoneIds[index];
    }

    /// @dev EIP-7702 accounts have code but still sign with their controlling EOA key.
    /// Try canonical ECDSA first, then fall back to ERC-1271 contract-wallet checks.
    function _isValidSigner(address expectedSigner, bytes32 digest, bytes calldata signature)
        private
        view
        returns (bool)
    {
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, signature);
        if (error == ECDSA.RecoverError.NoError && recovered == expectedSigner) {
            return true;
        }
        return SignatureChecker.isValidSignatureNow(expectedSigner, digest, signature);
    }
}
