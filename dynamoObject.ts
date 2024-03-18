import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export type Index<T> = {
  partitionKey: Exclude<keyof T, "_meta">;
  sortKey?: Exclude<keyof T, "_meta">;
};

export interface DynamoMeta<T> {
  tableName: string;
  partitionKey: Exclude<keyof T, "_meta">;
  sortKey?: Exclude<keyof T, "_meta">;
  indexes?: { [name: string]: Index<T> };
}

export abstract class DynamoObject<T> {
  abstract readonly _meta: DynamoMeta<T>;

  /**
   * @deprecated Please use the `.create` method instead to fill all required fields.
   */
  constructor() {}
}

class SharedDynamoClient {
  private client: DynamoDBDocumentClient = {} as DynamoDBDocumentClient;
  public set(client: DynamoDBDocumentClient) {
    this.client = client;
  }
  public initialize(marshallEmptyValues = true) {
    const dynamoDBClient = new DynamoDBClient();
    const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
      marshallOptions: { convertEmptyValues: marshallEmptyValues },
    });
    this.set(docClient);
  }
  public get(): DynamoDBDocumentClient {
    if (!("send" in this.client)) {
      console.error("SharedDynamoClient missing. Use sharedDynamoClient.set()");
      throw new Error(
        "SharedDynamoClient missing. Use sharedDynamoClient.set()",
      );
    }
    return this.client;
  }
}

export const sharedDynamoClient = new SharedDynamoClient();

export function getMeta<T extends DynamoObject<T>>(
  cls:
    | {
        new (): T;
      }
    | T,
): T["_meta"] {
  if ("_meta" in cls) return cls._meta;
  return new cls()._meta;
}

export function removeMeta<
  T extends
    | { [key: string]: any }
    | Array<any>
    | Set<any>
    | string
    | number
    | null
    | undefined,
>(input: T): T {
  if (Array.isArray(input)) return input.map((item) => removeMeta(item)) as T;

  if (input === null || typeof input !== "object" || input instanceof Set)
    return input;

  const result: { [key: string]: any } = {};
  Object.keys(input).forEach((key) => {
    if (key === "_meta") return;
    result[key] = removeMeta(input[key]);
  });
  return result as T;
}
