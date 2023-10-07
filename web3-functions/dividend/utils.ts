import { BigNumber } from "@ethersproject/bignumber";

export const MAX_RANGE = 3000; // limit range of events to comply with rpc providers
export const MAX_REQUESTS = 20; // limit number of requests on every execution to avoid hitting timeout
export const upPoolProxyAddress = "0xE9728Ed5E1FD05665C44a17082d77049801435f0";
export const commonPoolProxyAddress =
  "0x0FAF09eD08D2Ec65982088f12E3Bab7e7Cb2945f";
export const dividendProxyAddress =
  "0x1439d7daD45C248D94Dd553f0C02FDA8F1f54676";

const generateEmptyIncome = () => {
  const emptyIncome: { [key: number]: { usdc: number; matic: number } } = {};
  for (let i = 1; i <= 21; i++) {
    emptyIncome[i] = { usdc: 0, matic: 0 };
  }
  return emptyIncome;
};

export const EMPTY_INCOME = generateEmptyIncome();

const range = (start: number, end: number) => {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};
export const upRoleIds = range(9, 21);
export const commonRoleIds = range(1, 8);
export const roleIds = commonRoleIds.concat(upRoleIds);

export const decimalPlaces = {
  usdc: 6,
  matic: 18,
};

export const deepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

export interface IIncome {
  [roleId: number]: {
    usdc: BigNumber;
    matic: BigNumber;
  };
}
