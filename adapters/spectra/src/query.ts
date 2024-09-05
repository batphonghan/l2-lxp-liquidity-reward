import { request } from "graphql-request";
import { gql } from "graphql-request";
import EthDater from "ethereum-block-by-date";
import { Contract, ethers } from "ethers";

const MULTICALL_BATCH_SIZE = 1000;
const spectra =
  "https://subgraph.satsuma-prod.com/93c7f5423489/perspective/spectra-mainnet/api";

interface IDwise {
  id: string;
}

const ETH_RPC = "https://eth.llamarpc.com";
const ethProvider = new ethers.providers.JsonRpcProvider(ETH_RPC);

export const dater = new EthDater(ethProvider);

export async function getEtherumBlock(blockTimestampSecs: number) {
  const blockTimestampInMill = blockTimestampSecs * 1000;
  const date = new Date(blockTimestampInMill); //
  // External API

  const res = await dater.getDate(date);
  let blockNumber = res.block; // Try to get the exact block number

  return blockNumber;
}

async function subgraphFetchAllById<T extends IDwise>(
  endpoint: string,
  query: string,
  collection: string,
  variables: Record<string, unknown>
): Promise<T[]> {
  const data: T[] = [];
  let lastId = "0x0000000000000000000000000000000000000000";
  while (true) {
    const resp: { [collection: string]: T[] } = await request(endpoint, query, {
      ...variables,
      lastId
    });

    const batch: T[] = resp[collection];
    if (batch.length == 0) {
      break;
    }

    const last = batch[batch.length - 1];
    lastId = last.id;

    data.push(...batch);

    if (batch.length < MULTICALL_BATCH_SIZE) {
      break;
    }
  }
  return data;
}

interface GraphQLQuery {
  query: string;
  collection: string;
}

export type UserBalanceSubgraphEntry = {
  id: string;
  balance: string;
};

export const USER_BALANCES_QUERY: GraphQLQuery = {
  query: gql`
    query PositionsQuery($block: Int, $lastId: ID!) {
      userBalances(
        where: { balance_gt: "0", id_gt: $lastId }
        block: { number: $block }
        orderBy: id
        orderDirection: asc
        first: 1000
      ) {
        id
        balance
      }
    }
  `,
  collection: "userBalances"
};

interface GraphQLQuery {
  query: string;
  collection: string;
}

interface Share {
  id: string;
  portfolio: Portfolio[];
}

interface Portfolio {
  balance: string;
  asset: {
    address: string;
  };
}

const SHARES_QUERY: GraphQLQuery = {
  query: gql`
    query GetAccounts($block: Int, $lastId: ID!) {
      accounts(
        where: {
          portfolio_: {
            balance_not: "0"
            asset: "0x2d176fc14374201a1641db67e5a9761bf92726f8"
          }
        }
      ) {
        id
        portfolio(
          where: {
            asset: "0x2d176fc14374201a1641db67e5a9761bf92726f8"
            id_gt: $lastId
          }
          orderBy: id
        ) {
          balance
        }
      }
    }
  `,
  collection: "accounts"
};

export async function fetchSpectraPoolShares(block: number): Promise<Share[]> {
  return await subgraphFetchAllById<Share>(
    spectra,
    SHARES_QUERY.query,
    SHARES_QUERY.collection,
    { block: block }
  );
}
