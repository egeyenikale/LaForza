import { Interface } from "ethers";

type ReceiptLog = {
  address: string;
  topics: readonly string[];
  data: string;
};

const approvalInterface = new Interface([
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

const escrowInterface = new Interface([
  "event DealFunded(bytes32 indexed dealId, address indexed buyer, uint256 amount)",
]);

const sameAddress = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

export function provesBuyerApproval(
  logs: readonly ReceiptLog[],
  input: {
    token: string;
    buyer: string;
    escrow: string;
    minimumAmount: bigint;
  },
): boolean {
  return logs.some((log) => {
    if (!sameAddress(log.address, input.token)) return false;
    try {
      const parsed = approvalInterface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      return Boolean(
        parsed?.name === "Approval" &&
        sameAddress(String(parsed.args.owner), input.buyer) &&
        sameAddress(String(parsed.args.spender), input.escrow) &&
        BigInt(parsed.args.value) >= input.minimumAmount,
      );
    } catch {
      return false;
    }
  });
}

export function provesEscrowFunding(
  logs: readonly ReceiptLog[],
  input: {
    escrow: string;
    dealId: string;
    buyer: string;
    amount: bigint;
  },
): boolean {
  return logs.some((log) => {
    if (!sameAddress(log.address, input.escrow)) return false;
    try {
      const parsed = escrowInterface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      return Boolean(
        parsed?.name === "DealFunded" &&
        String(parsed.args.dealId).toLowerCase() ===
          input.dealId.toLowerCase() &&
        sameAddress(String(parsed.args.buyer), input.buyer) &&
        BigInt(parsed.args.amount) === input.amount,
      );
    } catch {
      return false;
    }
  });
}
