import {
  AttributeDefinition,
  CreateTableCommand,
  DescribeTableCommand,
  GlobalSecondaryIndex,
  KeySchemaElement,
  ProjectionType,
} from "@aws-sdk/client-dynamodb";
import { DynamoObject, getMeta, sharedDynamoClient } from "./dynamoObject";

export async function createTable<T extends DynamoObject<T>>(
  DynamoClass: new () => T
) {
  const {
    partitionKey: partitionKeyName,
    sortKey: sortKeyName,
    tableName: TableName,
    indexes = {},
  } = getMeta(DynamoClass);
  const KeySchema: KeySchemaElement[] = [
    { AttributeName: partitionKeyName as string, KeyType: "HASH" },
  ];
  const AttributeDefinitions: AttributeDefinition[] = [
    {
      AttributeName: partitionKeyName as string,
      AttributeType: "S", /// only S type keys supported for now.
    },
  ];
  if (sortKeyName) {
    KeySchema.push({ AttributeName: sortKeyName as string, KeyType: "RANGE" });
    AttributeDefinitions.push({
      AttributeName: sortKeyName as string,
      AttributeType: "S", /// only S type keys supported for now.
    });
  }

  const idx: GlobalSecondaryIndex[] = [];
  for (const indexName of Object.keys(indexes)) {
    const { partitionKey, sortKey } = indexes[indexName];
    const KeySchema: KeySchemaElement[] = [
      { AttributeName: partitionKey as string, KeyType: "HASH" },
    ];
    if (
      !AttributeDefinitions.map((attr) => attr.AttributeName).includes(
        partitionKey as string
      )
    ) {
      AttributeDefinitions.push({
        AttributeName: partitionKey as string,
        AttributeType: "S", /// only S type keys supported for now.
      });
    }
    if (sortKey) {
      KeySchema.push({ AttributeName: sortKey as string, KeyType: "RANGE" });
      if (
        !AttributeDefinitions.map((attr) => attr.AttributeName).includes(
          sortKey as string
        )
      ) {
        AttributeDefinitions.push({
          AttributeName: sortKey as string,
          AttributeType: "S", /// only S type keys supported for now.
        });
      }
    }
    idx.push({
      KeySchema,
      IndexName: indexName,
      Projection: { ProjectionType: ProjectionType.ALL },
    });
  }

  return sharedDynamoClient.get().send(
    new CreateTableCommand({
      TableName,
      KeySchema,
      GlobalSecondaryIndexes: idx.length ? idx : undefined, /// Only global indexes supported for now
      AttributeDefinitions,
      BillingMode: "PAY_PER_REQUEST",
    })
  );
}

export async function ensureTable<T extends DynamoObject<T>>(
  DynamoClass: new () => T
) {
  const { tableName } = getMeta(DynamoClass);
  try {
    const result = await sharedDynamoClient
      .get()
      .send(new DescribeTableCommand({ TableName: tableName }));
    if (result.Table?.TableName !== tableName) throw new Error("wrong name");
  } catch (error: any) {
    await createTable(DynamoClass);
  }
}
