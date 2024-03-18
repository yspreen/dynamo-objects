import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoObject, getMeta, sharedDynamoClient } from "./dynamoObject";

export type NoSort = { _meta: { sortKey?: never } };
export type WithSort<T> = { _meta: { sortKey: Exclude<keyof T, "_meta"> } };
export type IdxWithSort<T> = { sortKey: Exclude<keyof T, "_meta"> };

export async function getItem<T extends DynamoObject<T>>(
  DynamoClass: new () => T & NoSort,
  partitionKey: string
): Promise<T | undefined>;

export async function getItem<T extends DynamoObject<T>>(
  DynamoClass: new () => T & WithSort<T>,
  partitionKey: string,
  sortKey: string
): Promise<T | undefined>;

export async function getItem<T extends DynamoObject<T>>(
  DynamoClass: new () => T,
  partitionKey: string,
  sortKey?: string
): Promise<T | undefined> {
  const _meta = getMeta(DynamoClass);
  const {
    partitionKey: partitionKeyName,
    sortKey: sortKeyName,
    tableName,
  } = _meta;
  const Key = {
    [partitionKeyName as string]: partitionKey,
  };
  if (sortKeyName && sortKey) {
    Key[sortKeyName as string] = sortKey;
  }

  const result = await sharedDynamoClient.get().send(
    new GetCommand({
      TableName: tableName,
      Key,
    })
  );

  if (result.Item === undefined) return undefined;
  return { _meta, ...result.Item } as T;
}

type QueryProps = {
  partitionKey: string;
  sortKey?: string;
  sorted?: "ASC" | "DESC";
  nextPage?: string | null;
  limit?: number;
};

export async function getItems<
  T extends DynamoObject<T>,
  I extends keyof T["_meta"]["indexes"]
>(
  DynamoClass: new () => T,
  idxName: T["_meta"]["indexes"][I] extends IdxWithSort<T> ? never : I,
  args: {
    partitionKey: string;
    sorted?: "ASC" | "DESC";
    nextPage?: string | null;
    limit?: number;
  }
): Promise<{
  items: T[];
  nextPage: string | null;
}>;

export async function getItems<
  T extends DynamoObject<T>,
  I extends keyof T["_meta"]["indexes"]
>(
  DynamoClass: new () => T,
  idxName: T["_meta"]["indexes"][I] extends IdxWithSort<T> ? I : never,
  args: {
    partitionKey: string;
    sortKey?: string;
    sorted?: "ASC" | "DESC";
    nextPage?: string | null;
    limit?: number;
  }
): Promise<{
  items: T[];
  nextPage: string | null;
}>;

export async function getItems<
  T extends DynamoObject<T>,
  I extends keyof T["_meta"]["indexes"]
>(
  DynamoClass: new () => T & WithSort<T>,
  args: {
    partitionKey: string;
    sortKey?: string;
    sorted?: "ASC" | "DESC";
    nextPage?: string | null;
    limit?: number;
  }
): Promise<{
  items: T[];
  nextPage: string | null;
}>;

export async function getItems<
  T extends DynamoObject<T>,
  I extends keyof T["_meta"]["indexes"]
>(
  DynamoClass: new () => T & NoSort,
  args: {
    partitionKey: string;
    sorted?: "ASC" | "DESC";
    nextPage?: string | null;
    limit?: number;
  }
): Promise<{
  items: T[];
  nextPage: string | null;
}>;

export async function getItems<T extends DynamoObject<T>>(
  DynamoClass: new () => T,
  propsOrIdx: string | QueryProps,
  props?: string | QueryProps
): Promise<{
  items: T[];
  nextPage: string | null;
}> {
  return runQuery(DynamoClass, propsOrIdx, props);
}

async function runQuery<T extends DynamoObject<T>>(
  DynamoClass: new () => T,
  propsOrIdx: string | QueryProps,
  props?: string | QueryProps
): Promise<{
  items: T[];
  nextPage: string | null;
}> {
  let ExclusiveStartKey: Record<string, any> | undefined;
  const {
    partitionKey,
    sortKey = undefined,
    sorted = "ASC",
    nextPage = null,
    limit = 50,
  } = (props ?? propsOrIdx) as QueryProps;
  const idxName = props ? (propsOrIdx as string) : undefined;

  const _meta = getMeta(DynamoClass);
  let {
    tableName: TableName,
    partitionKey: partitionKeyName,
    sortKey: sortKeyName,
    indexes,
  } = _meta;
  if (idxName) {
    partitionKeyName = indexes?.[idxName].partitionKey as Exclude<
      keyof T,
      "_meta"
    >;
    sortKeyName = indexes?.[idxName].sortKey;
  }

  if (nextPage) {
    ExclusiveStartKey = JSON.parse(nextPage);
  }

  let KeyConditionExpression = `#key = :key`;
  if (sortKey !== undefined)
    KeyConditionExpression += ` and #sort ${
      sortKey === "ASC" ? ">" : "<"
    } :sort`;

  const result = await sharedDynamoClient.get().send(
    new QueryCommand({
      TableName,
      IndexName: idxName,
      KeyConditionExpression,
      ExpressionAttributeValues:
        sortKey !== undefined
          ? {
              ":key": partitionKey,
              ":sort": sortKey,
            }
          : {
              ":key": partitionKey,
            },
      ExpressionAttributeNames:
        sortKey !== undefined
          ? {
              "#key": partitionKeyName as string,
              "#sort": sortKeyName as string,
            }
          : {
              "#key": partitionKeyName as string,
            },
      Limit: limit,
      ExclusiveStartKey,
      ScanIndexForward: sorted === "ASC",
    })
  );

  let resultNextPageKey: string | null = null;
  if (result.LastEvaluatedKey) {
    resultNextPageKey = JSON.stringify(result.LastEvaluatedKey);
  }

  if (!result.Items?.length)
    return {
      items: [],
      nextPage,
    };

  return {
    items: result.Items.map((item) => ({ _meta, ...item } as T)),
    nextPage: resultNextPageKey,
  };
}

export async function getAllItems<T extends DynamoObject<T>>(
  DynamoClass: new () => T & WithSort<T>,
  args: {
    partitionKey: string;
    sortKey: string;
    sorted?: "ASC" | "DESC";
  }
): Promise<T[]>;

export async function getAllItems<T extends DynamoObject<T>>(
  DynamoClass: new () => T & NoSort,
  args: {
    partitionKey: string;
    sorted?: "ASC" | "DESC";
  }
): Promise<T[]>;

export async function getAllItems<T extends DynamoObject<T>>(
  DynamoClass: new () => T,
  args: {
    partitionKey: string;
    sortKey?: string;
    sorted?: "ASC" | "DESC";
  }
): Promise<T[]> {
  let nextPage: string | null = null;
  const allItems: T[] = [];

  do {
    const result: {
      items: T[];
      nextPage: string | null;
    } = await runQuery(DynamoClass, { nextPage, ...args });
    nextPage = result.nextPage;
    allItems.push(...result.items);
  } while (nextPage);

  return allItems;
}
