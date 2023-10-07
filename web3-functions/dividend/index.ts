import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Log } from "@ethersproject/providers";
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

const decimalPlaces = {
  usdc: 6,
  matic: 18,
};

const deepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

interface IIncome {
  [roleId: number]: {
    usdc: BigNumber;
    matic: BigNumber;
  };
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, storage, multiChainProvider } = context;
  const interval = (userArgs.intervalHours as number) ?? 24;

  const provider = multiChainProvider.default();

  const upPoolProxyAddress = userArgs.upPoolProxy as string;
  const commonPoolProxyAddress = userArgs.commonPoolProxy as string;
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

  const topics = [upPoolProxy.interface.getEventTopic("PayLoot")];

  const currentBlock = await provider.getBlockNumber();

  const normalTimestamp = Math.floor(Date.now() / 1000);

  const lastExec = parseInt(
    (await storage.get("lastExec")) ?? userArgs.startTimestamp.toString()
  ); // last execution timestamp
  console.log("lastExec", lastExec);

  const lastBlockQuery = parseInt(
    (await storage.get("lastBlock")) ?? userArgs.startBlock.toString()
  );
  console.log("lastBlockQuery", lastBlockQuery);

  const storedUpIncome = await storage.get("upIncome");

  const parsedUpIncome: IIncome = storedUpIncome
    ? JSON.parse(storedUpIncome)
    : EMPTY_INCOME;
  const upIncome: IIncome = deepCopy(parsedUpIncome);

  const storedCommonIncome = await storage.get("commonIncome");
  const parsedCommonIncome: IIncome = storedCommonIncome
    ? JSON.parse(storedCommonIncome)
    : EMPTY_INCOME;

  const commonIncome: IIncome = deepCopy(parsedCommonIncome);

  let lastBlock = lastBlockQuery;

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

  await storage.set("lastBlock", lastBlock.toString());

  if (
    lastExec + 60 * 60 * interval <= normalTimestamp ||
    new Date(lastExec * 1000).getUTCDate() <
      new Date(normalTimestamp * 1000).getUTCDate()
  ) {
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

      await storage.set("lastExec", normalTimestamp.toString());
      await storage.set("upIncome", JSON.stringify(EMPTY_INCOME));
      await storage.set("commonIncome", JSON.stringify(EMPTY_INCOME));

      return {
        canExec: true,
        callData: [
          {
            to: upPoolProxyAddress,
            data: upPoolProxy.interface.encodeFunctionData("dailyDivide", [
              upRoleIds,
              upRoleIdPoolBalanceToday,
            ]),
          },
          {
            to: commonPoolProxyAddress,
            data: commonPoolProxy.interface.encodeFunctionData("dailyDivide", [
              commonRoleIds,
              commonRoleIdPoolBalanceToday,
            ]),
          },
        ],
      };
    } else {
      return {
        canExec: false,
        message: `Failed to get latest price at ${currentBlock}`,
      };
    }
  } else {
    const upPoolUpdated = upLogs.length > 0;
    if (upPoolUpdated) {
      await storage.set("upIncome", JSON.stringify(upIncome));
    }
    const commonPoolUpdated = commonLogs.length > 0;
    if (commonPoolUpdated) {
      await storage.set("commonIncome", JSON.stringify(commonIncome));
    }

    // format readable income
    const income = Object.keys(upIncome).reduce((acc, key) => {
      const upIncomeEntry = upIncome[key];
      const commonIncomeEntry = commonIncome[key];

      const combinedEntry = Object.keys(upIncomeEntry).reduce(
        (entryAcc, currency) => {
          const upIncomeValue = BigNumber.from(upIncomeEntry[currency]);
          const commonIncomeValue = BigNumber.from(commonIncomeEntry[currency]);

          const combinedValue = upIncomeValue.add(commonIncomeValue);

          const storedValue = combinedValue.isZero() ? 0 : combinedValue;

          return {
            ...entryAcc,
            [currency]: storedValue,
          };
        },
        {}
      );

      const allValuesZero = Object.values(combinedEntry).every(
        (value) => value === 0
      );

      if (allValuesZero) {
        return acc;
      }

      return {
        ...acc,
        [key]: combinedEntry,
      };
    }, {});

    const readableIncome = Object.keys(income).reduce((acc, key) => {
      const incomeEntry = income[key];

      const readableEntry = Object.keys(incomeEntry).reduce(
        (entryAcc, currency) => {
          const incomeValue = BigNumber.from(incomeEntry[currency]);
          const decimals = decimalPlaces[currency];
          const readableValue = formatUnits(incomeValue, decimals);

          return {
            ...entryAcc,
            [currency]: readableValue,
          };
        },
        {}
      );

      return {
        ...acc,
        [key]: readableEntry,
      };
    }, {});

    return {
      canExec: false,
      message:
        upPoolUpdated || commonPoolUpdated
          ? `income: ${JSON.stringify(readableIncome)}`
          : `No dividend at block ${currentBlock}(${normalTimestamp})`,
    };
  }
});
