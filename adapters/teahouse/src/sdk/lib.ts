import { ethers } from 'ethers';
import { client, V3_SUBGRAPH_URL } from "./config";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type UserShareTokenBalance = {
    user: string;
    block_number: number;
    contractId: string;        
    balance: bigint,
}

interface Position {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
}

interface PoolInfo {
    token0: string; // Assuming token addresses are represented as strings
    token1: string;
    decimals0: number;
    decimals1: number;
    feeTier: number;
    sqrtPriceX96: bigint;
    tick: number;
  }

interface Transfer {
    contractId_: string;
    from: string;
    to: string;
    value: string;
    timestamp_: string;
    block_number: number;
  }
  
interface TransferData {
    data: {
        transfers: Transfer[];
    };
}

export const getUsersShareTokenBalancesByBlock = async (blockNumber: number): Promise<UserShareTokenBalance[] | null> => {
    // Function implementation goes here
    let snapshotsArrays: Transfer[] = [];
    const usersShareTokenBalances: UserShareTokenBalance[] = [];

    let skip = 0;
    const b_end = blockNumber;
    let b_start = 0;
    while (true) {
      let transferQuery = `
        query TransferQuery {
          transfers(
            skip: ${skip},
            first: 1000,
            orderBy: contractId_,
            orderDirection: asc,
            where: {
              block_number_lte: ${b_end},
            }
          ) {
            contractId_
            from
            to
            value
            timestamp_
          }
        }`;
  
      const responseJson = await post(V3_SUBGRAPH_URL, { query: transferQuery });
      const transferData: TransferData = responseJson as TransferData;
      snapshotsArrays = snapshotsArrays.concat(transferData.data.transfers);

      if (transferData.data.transfers.length !== 1000) {
        break;
      }
      skip += 1000;
      if (skip > 5000) {
        skip = 0;
        b_start = snapshotsArrays[snapshotsArrays.length - 1].block_number + 1;
      }
    }
  
    const addressBalances: { [address: string]: { [contractId: string]: bigint } } = {};
  
    snapshotsArrays.forEach(transfer => {
      const { contractId_, from, to, value } = transfer;
      const bigIntValue = BigInt(value);
  
      if (from !== ZERO_ADDRESS) {
        if (!addressBalances[from]) {
          addressBalances[from] = {};
        }
        addressBalances[from][contractId_] = (addressBalances[from][contractId_] || BigInt(0)) - bigIntValue;
      }
  
      if (to !== ZERO_ADDRESS) {
        if (!addressBalances[to]) {
          addressBalances[to] = {};
        }
        addressBalances[to][contractId_] = (addressBalances[to][contractId_] || BigInt(0)) + bigIntValue;
      }
    });

    Object.entries(addressBalances).forEach(([address, balances]) => {
        Object.entries(balances).forEach(([contractId, balance]) => {
          usersShareTokenBalances.push({
            block_number: blockNumber,
            contractId: contractId,
            user: address,
            balance: balance,
          });
        });
      });

    // Filter out entries with balance === 0
    const filteredBalances = usersShareTokenBalances.filter(balance => balance.balance !== 0n);

    return filteredBalances.length > 0 ? filteredBalances : null;    
}

export const getVaultsAllPositionsByBlock = async (contract: ethers.Contract, blockNumber: number): Promise<Position[]> => {
  try {
    // Get the contract instance at the specified block number
    const positions = await contract.getAllPositions({blockTag: blockNumber});
    const formattedPositions = positions.map((position: any) => {
      return {
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        liquidity: BigInt(position.liquidity.toString()),
      };
    });
    return formattedPositions;
  } catch (error) {
    console.error('Error fetching positions:', error);
    return [];
  }
};

export const getPoolInfoByBlock = async (contract: ethers.Contract, blockNumber: number): Promise<PoolInfo> => {
    try {
        const [token0, token1, decimals0, decimals1, feeTier, sqrtPriceX96, tick] = await contract.getPoolInfo({blockTag: blockNumber});
        // console.log("Raw Pool Info:", info); // Log raw info for debugging        
        return {
            token0,
            token1,
            decimals0,
            decimals1,
            feeTier,
            sqrtPriceX96: BigInt(sqrtPriceX96.toString()),
            tick,
          };
        } catch (error) {
          console.error('Error fetching pool info:', error);
          return {
            token0: "",
            token1: "",
            decimals0: 0,
            decimals1: 0,
            feeTier: 0,
            sqrtPriceX96: BigInt(0),
            tick: 0,
          };
      }
};

export const getAmountsForLiquidityByBlock = async (contract: ethers.Contract, tickLower: number, tickUpper: number, liquidity: BigInt, blockNumber: number): Promise<{amount0: BigInt, amount1: BigInt}> => {
    try {
        const amounts = await contract.getAmountsForLiquidity(tickLower, tickUpper, liquidity, {blockTag: blockNumber});
        return {
        amount0: amounts.amount0,
        amount1: amounts.amount1,
        };
    } catch (error) {
        console.error('Error fetching amounts:', error);
        return {amount0: BigInt(0), amount1: BigInt(0)};
    }
};

export const getTimestampAtBlock = async (blockNumber: number) => {
    const block = await client.getBlock({
        blockNumber: BigInt(blockNumber),
    });
    return Number(block.timestamp * 1000n);
};

const post = async (url: string, data: any): Promise<any> => {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(data),
    });
    return await response.json();
  };
