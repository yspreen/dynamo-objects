import {
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DynamoObject,
  getMeta,
  removeMeta,
  sharedDynamoClient,
} from "./dynamoObject";

export async function putObject<T extends DynamoObject<T>>(object: T) {
  return sharedDynamoClient.get().send(
    new PutCommand({
      TableName: getMeta(object).tableName,
      Item: removeMeta(object),
    })
  );
}

export async function deleteObject<T extends DynamoObject<T>>(object: T) {
  const {
    tableName: TableName,
    partitionKey: partitionKeyName,
    sortKey: sortKeyName,
  } = getMeta(object);
  const Key: Record<string, any> = {};
  Key[partitionKeyName as string] = object[partitionKeyName];
  sortKeyName !== undefined &&
    (Key[sortKeyName as string] = object[sortKeyName]);

  return sharedDynamoClient.get().send(
    new DeleteCommand({
      TableName,
      Key,
    })
  );
}

/// This will perform a partial update. Only setting the keys that are present.
/// Works with all keys regardless of being in the schema as attributes or not.
export async function updateObject<T extends DynamoObject<T>>(
  object: T,
  keyFilter?: (keyof T)[]
) {
  const {
    tableName: TableName,
    partitionKey: partitionKeyName,
    sortKey: sortKeyName,
  } = getMeta(object);
  object = removeMeta(object);
  const keys = (keyFilter as string[]) ?? Object.keys(object);

  let expr = "";
  let ExpressionAttributeValues: any = {};
  let ExpressionAttributeNames: any = {};

  for (const key of keys) {
    if (!key) continue;
    if (typeof object[key as keyof T] === "function") continue;
    if (typeof object[key as keyof T] === "undefined") continue;
    if (key === partitionKeyName || key === sortKeyName) {
      continue;
    }

    expr += `, #k_${key} = :${key}`;
    ExpressionAttributeValues[`:${key}`] = object[key as keyof T];
    ExpressionAttributeNames[`#k_${key}`] = key;
  }
  const Key = {
    [partitionKeyName]: object[partitionKeyName],
  };
  if (sortKeyName) {
    Key[sortKeyName as string] = object[sortKeyName];
  }

  const params = {
    TableName,
    Key,
    UpdateExpression: `set${expr.slice(1)}`,
    ExpressionAttributeValues,
    ExpressionAttributeNames,
  };

  return sharedDynamoClient.get().send(new UpdateCommand(params));
}

/// This method will increment a key atomically even if it's not part of the schema.
export async function incrementObject<
  T extends DynamoObject<T>,
  K extends keyof T
>(
  object: T,
  incrementVariable: T[K] extends number ? K : never,
  incrementValue = 1
) {
  const {
    partitionKey: partitionKeyName,
    sortKey: sortKeyName,
    tableName: TableName,
  } = getMeta(object);
  const Key: Record<string, any> = {
    [partitionKeyName]: object[partitionKeyName],
  };
  if (sortKeyName) {
    Key[sortKeyName as string] = object[sortKeyName];
  }

  return (
    await sharedDynamoClient.get().send(
      new UpdateCommand({
        TableName,
        Key,
        UpdateExpression: `add #key :val`,
        ExpressionAttributeNames: {
          "#key": incrementVariable as string,
        },
        ExpressionAttributeValues: {
          ":val": incrementValue,
        },
        ReturnValues: "UPDATED_NEW",
      })
    )
  ).Attributes?.[incrementVariable as string] as number | undefined;
}
