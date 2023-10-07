import { JsonRpcProvider, Log } from "@ethersproject/providers";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { formatUnits } from "@ethersproject/units";
import { poolABI } from "./poolABI";

const MAX_RANGE = 3000; // limit range of events to comply with rpc providers
const MAX_REQUESTS = 20; // limit number of requests on every execution to avoid hitting timeout
const generateEmptyIncome = () => {
  const emptyIncome: { [key: number]: { usdc: number; matic: number } } = {};
  for (let i = 1; i <= 21; i++) {
    emptyIncome[i] = { usdc: 0, matic: 0 };
  }
  return emptyIncome;
};

const EMPTY_INCOME = generateEmptyIncome();

const range = (start: number, end: number) => {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};
const upRoleIds = range(9, 21);
const commonRoleIds = range(1, 8);

const deepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

interface IIncome {
  [roleId: number]: {
    usdc: BigNumber;
    matic: BigNumber;
  };
}

const startBlock = 47352057; // 2023-09-10 00:00:00 UTC
const upPoolProxyAddress = "0xE9728Ed5E1FD05665C44a17082d77049801435f0";
const commonPoolProxyAddress = "0x0FAF09eD08D2Ec65982088f12E3Bab7e7Cb2945f";
const provider = new JsonRpcProvider("https://rpc.ankr.com/polygon");

async function main() {
  const upPoolProxy = new Contract(upPoolProxyAddress, poolABI, provider);
  const commonPoolProxy = new Contract(
    commonPoolProxyAddress,
    poolABI,
    provider
  );

  const getLatestPrice = async () => {
    try {
      const rate = await upPoolProxy.getLatestPrice();
      return rate;
    } catch (error) {
      console.error("Error getting latest price:", error);
      return null;
    }
  };

  let storedUpIncome;
  const parsedUpIncome: IIncome = storedUpIncome
    ? JSON.parse(storedUpIncome)
    : EMPTY_INCOME;
  const upIncome: IIncome = deepCopy(parsedUpIncome);

  let storedCommonIncome;
  const parsedCommonIncome: IIncome = storedCommonIncome
    ? JSON.parse(storedCommonIncome)
    : EMPTY_INCOME;
  const commonIncome: IIncome = deepCopy(parsedCommonIncome);

  const topics = [upPoolProxy.interface.getEventTopic("PayLoot")];

  const currentBlock = await provider.getBlockNumber();

  let lastBlock = startBlock;

  // Fetch recent logs in range of 100 blocks
  const upLogs: Log[] = [];
  const commonLogs: Log[] = [];
  let nbRequests = 0;
  while (lastBlock < currentBlock && nbRequests < MAX_REQUESTS) {
    nbRequests++;
    const fromBlock = lastBlock + 1;
    const toBlock = Math.min(fromBlock + MAX_RANGE, currentBlock);
    console.log(`Fetching log events from blocks ${fromBlock} to ${toBlock}`);
    try {
      const upResult = await provider.getLogs({
        address: upPoolProxyAddress,
        topics,
        fromBlock,
        toBlock,
      });
      const commonResult = await provider.getLogs({
        address: commonPoolProxyAddress,
        topics,
        fromBlock,
        toBlock,
      });
      upLogs.push(...upResult);
      commonLogs.push(...commonResult);
      lastBlock = toBlock;
    } catch (err) {
      return {
        canExec: false,
        message: `Rpc call failed: ${(err as Error).message ?? ""}`,
      };
    }
  }
  // update up income
  if (upLogs.length > 0) {
    for (const log of upLogs) {
      const decodedLog = upPoolProxy.interface.parseLog(log);
      const captainId = decodedLog.args.captainId;
      const usdc = decodedLog.args.usdc;
      const amount = decodedLog.args.amount;

      if (upIncome[captainId]) {
        if (usdc) {
          upIncome[captainId].usdc = BigNumber.from(
            upIncome[captainId].usdc
          ).add(amount);
        } else {
          upIncome[captainId].matic = BigNumber.from(
            upIncome[captainId].matic
          ).add(amount);
        }
      }
    }
  }

  // update common income
  if (commonLogs.length > 0) {
    for (const log of commonLogs) {
      const decodedLog = commonPoolProxy.interface.parseLog(log);
      const captainId = decodedLog.args.captainId;
      const usdc = decodedLog.args.usdc;
      const amount = decodedLog.args.amount;

      if (commonIncome[captainId]) {
        if (usdc) {
          commonIncome[captainId].usdc = BigNumber.from(
            commonIncome[captainId].usdc
          ).add(amount);
        } else {
          commonIncome[captainId].matic = BigNumber.from(
            commonIncome[captainId].matic
          ).add(amount);
        }
      }
    }
  }

  console.log("lastBlock", lastBlock);
  console.log("upIncome", upIncome);
  console.log("commonIncome", commonIncome);

  const rate = await getLatestPrice();

  const maticPrecision = BigNumber.from(10).pow(18);
  const usdcPrecision = BigNumber.from(10).pow(6);
  const ratePrecision = BigNumber.from(10).pow(8);

  const rateBigNumber = BigNumber.from(rate);

  if (rate) {
    const upRoleIdPoolBalanceToday = upRoleIds.map((roleId) => {
      const usdc = BigNumber.from(upIncome[roleId].usdc);
      const matic = BigNumber.from(upIncome[roleId].matic);

      const maticToUsdc = matic
        .mul(rateBigNumber)
        .div(ratePrecision)
        .div(maticPrecision.div(usdcPrecision));

      return usdc.add(maticToUsdc).div(2).toNumber();
    });

    const commonRoleIdPoolBalanceToday = commonRoleIds.map((roleId) => {
      const usdc = BigNumber.from(commonIncome[roleId].usdc);
      const matic = BigNumber.from(commonIncome[roleId].matic);

      const maticToUsdc = matic
        .mul(rateBigNumber)
        .div(ratePrecision)
        .div(maticPrecision.div(usdcPrecision));

      return usdc.add(maticToUsdc).div(2).toNumber();
    });

    console.log("upRoleIdPoolBalanceToday", upRoleIdPoolBalanceToday);
    console.log("commonRoleIdPoolBalanceToday", commonRoleIdPoolBalanceToday);
  }
}

main();
