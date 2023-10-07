export const poolABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "usdc",
        type: "bool",
      },
      {
        indexed: false,
        internalType: "uint16",
        name: "captainId",
        type: "uint16",
      },
    ],
    name: "PayLoot",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "uint16[]",
        name: "roleIds_",
        type: "uint16[]",
      },
      {
        internalType: "uint256[]",
        name: "roleIdPoolBalanceToday_",
        type: "uint256[]",
      },
    ],
    name: "dailyDivide",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getLatestPrice",
    outputs: [
      {
        internalType: "int256",
        name: "",
        type: "int256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
