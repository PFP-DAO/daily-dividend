import { JsonRpcProvider, Log } from "@ethersproject/providers";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { poolABI } from "./poolABI";
import {
  upPoolProxyAddress,
  commonPoolProxyAddress,
  EMPTY_INCOME,
  MAX_RANGE,
  MAX_REQUESTS,
  IIncome,
  deepCopy,
  roleIds,
} from "./utils";

const startBlock = 48414650; // 2023-10-07 00:00:00 UTC
const provider = new JsonRpcProvider(process.env.PROVIDER_URLS);

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
  console.log("upIncome", JSON.stringify(upIncome));
  console.log("commonIncome", JSON.stringify(commonIncome));

  const rate = await getLatestPrice();

  const maticPrecision = BigNumber.from(10).pow(18);
  const usdcPrecision = BigNumber.from(10).pow(6);
  const ratePrecision = BigNumber.from(10).pow(8);

  const rateBigNumber = BigNumber.from(rate);

  if (rate) {
    const upRoleIdPoolBalanceToday = roleIds.map((roleId) => {
      const usdc = BigNumber.from(upIncome[roleId].usdc);
      const matic = BigNumber.from(upIncome[roleId].matic);

      const maticToUsdc = matic
        .mul(rateBigNumber)
        .div(ratePrecision)
        .div(maticPrecision.div(usdcPrecision));

      return usdc.add(maticToUsdc).div(2).toNumber();
    });

    const commonRoleIdPoolBalanceToday = roleIds.map((roleId) => {
      const usdc = BigNumber.from(commonIncome[roleId].usdc);
      const matic = BigNumber.from(commonIncome[roleId].matic);

      const maticToUsdc = matic
        .mul(rateBigNumber)
        .div(ratePrecision)
        .div(maticPrecision.div(usdcPrecision));

      return usdc.add(maticToUsdc).div(2).toNumber();
    });

    const totalRoleIdPoolBalanceToday: number[] = [];
    for (let i = 0; i < roleIds.length; i++) {
      const totalBalance =
        commonRoleIdPoolBalanceToday[i] + upRoleIdPoolBalanceToday[i];
      totalRoleIdPoolBalanceToday.push(totalBalance);
    }
    const upPoolCallIncome = totalRoleIdPoolBalanceToday.slice(8);
    const commonPoolCallIncome = totalRoleIdPoolBalanceToday.slice(0, 8);

    console.log("upPoolCallIncome", JSON.stringify(upPoolCallIncome));
    console.log("commonPoolCallIncome", JSON.stringify(commonPoolCallIncome));
  }
}

main();
