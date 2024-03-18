## Table Definitions (dynamo-objects)

```ts
class User extends DynamoObject<User> {
  _meta = {
    tableName: `user${STAGING ? "-stg" : ""}`,
    partitionKey: "id",
  } as const;

  id = "";
  firstName = "";
  settings = {} as { notificationsEnabled: boolean };
  lastLogInTs = "";
  notificationsSent = 0;

  /// Factory with all fields required.
  static create(props: Omit<User, "_meta">): User {
    return { _meta: getMeta(User), ...props };
  }

  /// Convenience initializer with defaults.
  static makeWithFirstName(firstName: string): User {
    return User.create({
      notificationsSent: 0,
      id: randomUUID(),
      firstName,
      lastLogInTs: new Date().toISOString(),
      settings: { notificationsEnabled: false },
    });
  }
}

class Message extends DynamoObject<Message> {
  _meta = {
    tableName: `message${STAGING ? "-stg" : ""}`,
    partitionKey: "sentByUserId",
    sortKey: "createdAtTs",
    indexes: {
      indexName: {
        partitionKey: "indexPartitionKey",
      },
      indexWithSortKey: {
        partitionKey: "indexPartitionKey",
        sortKey: "indexSortKey",
      },
    },
  } as const;

  sentByUserId = "";
  createdAtTs = "";
  indexPartitionKey = "";
  indexSortKey = "";

  /// Factory with all fields required.
  static create(props: Omit<Message, "_meta">): Message {
    return { _meta: getMeta(Message), ...props };
  }
}
```

## Creating a Table

### dynamo-objects

```ts
await ensureTable(Message);
```

### vanilla

```ts
// not shown here: checking if the table already exists. then:
const createMessageTableCommand = new CreateTableCommand({
  TableName: "message",
  KeySchema: [
    { AttributeName: "sentByUserId", KeyType: "HASH" },
    { AttributeName: "createdAtTs", KeyType: "RANGE" },
  ], // Partition key and sort key
  AttributeDefinitions: [
    { AttributeName: "sentByUserId", AttributeType: "S" },
    { AttributeName: "createdAtTs", AttributeType: "S" },
    { AttributeName: "indexPartitionKey", AttributeType: "S" }, // For secondary index
    { AttributeName: "indexSortKey", AttributeType: "S" }, // For secondary index
  ],
  BillingMode: "PAY_PER_REQUEST",
  GlobalSecondaryIndexes: [
    {
      IndexName: "indexName",
      KeySchema: [{ AttributeName: "indexPartitionKey", KeyType: "HASH" }],
      Projection: { ProjectionType: "ALL" },
    },
    {
      IndexName: "indexWithSortKey",
      KeySchema: [
        { AttributeName: "indexPartitionKey", KeyType: "HASH" },
        { AttributeName: "indexSortKey", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
});
await client.send(createMessageTableCommand);
```

## Getting an Object

### dynamo-objects

```ts
const alice = await getObject(User, "alice");
```

### vanilla

```ts
const getUserCommand = new GetItemCommand({
  TableName: "user",
  Key: marshall({ id: "userId1" }),
});

const user = await client.send(getUserCommand);
console.log("User:", unmarshall(user.Item));
```

## Query Without Index

### dynamo-objects

```ts
const { objects, nextPage } = await getObjects(Message, {
  partitionKey: "alice",
});
```

### vanilla

```ts
const command = new QueryCommand({
  TableName: "message",
  KeyConditionExpression: "sentByUserId = :id",
  ExpressionAttributeValues: marshall({ ":id": "alice" }),
});

const result = await client.send(command);
const items = result.Items.map((item) => unmarshall(item));
```

## Query With Index

### dynamo-objects

```ts
const { objects, nextPage } = await getObjects(Message, "indexWithSortKey", {
  partitionKey: "someValue",
  sortKey: "2023-03-15",
});
```

### vanilla

```ts
const command = new QueryCommand({
  TableName: "message",
  IndexName: "indexWithSortKey",
  KeyConditionExpression: "indexPartitionKey = :ipk and indexSortKey = :isk",
  ExpressionAttributeValues: marshall({
    ":ipk": "someValue",
    ":isk": "2023-03-15",
  }),
});

const result = await client.send(command);
const items = result.Items.map((item) => unmarshall(item));
```

## Putting an Object

### dynamo-objects

```ts
const user = User.makeWithFirstName("Alice");
await putObject(user);
```

### vanilla

```ts
const newUser = {
  id: "userId2",
  firstName: "Alice",
  settings: { notificationsEnabled: false },
  lastLogInTs: "2024-03-18T00:00:00Z",
  notificationsSent: 0,
};

const putUserCommand = new PutItemCommand({
  TableName: "user",
  Item: marshall(newUser),
});

await client.send(putUserCommand);
```

## Updating a Key

### dynamo-objects

```ts
user.settings.notificationsEnabled = true;
await updateObject(user, ["settings"]);
```

### vanilla

```ts
const updateOneKeyCommand = new UpdateItemCommand({
  TableName: "user",
  Key: marshall({ id: "userId1" }),
  UpdateExpression: "set firstName = :fn",
  ExpressionAttributeValues: marshall({ ":fn": "Jane" }),
});

await client.send(updateOneKeyCommand);
```

## Incrementing a Key

### dynamo-objects

```ts
await incrementObject(user, "notificationsSent");
```

### vanilla

```ts
const incrementFieldCommand = new UpdateItemCommand({
  TableName: "user",
  Key: marshall({ id: "userId1" }),
  UpdateExpression: "set notificationsSent = notificationsSent + :val",
  ExpressionAttributeValues: marshall({ ":val": 1 }),
});

await client.send(incrementFieldCommand);
```

## Imports

### dynamo-objects

```ts
import {
  ensureTable,
  getObject,
  getObjects,
  incrementObject,
  putObject,
  updateObject,
} from "@spreen/dynamo-objects";
import { User } from "models/User";
import { Message } from "models/Message";
```

### vanilla

```ts
import {
  DynamoDBClient,
  CreateTableCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
```

## Caveats

### Constructors

In order to have a static const readable \_meta field on every object, as defined by the class, all properties of a DynamoObject need to have a default value. So it's

```ts
sentByUserId = "";
```

rather than

```ts
sentByUserId: string;
```

To make up for this, the no-parameter constructor for DynamoObjects is deprecated. All DynamoObjects are intended to have a factory method like

```ts
/// Factory with all fields required.
static create(props: Omit<User, "_meta">): User {
  return { _meta: getMeta(User), ...props };
}
```

This method has a property that requires all fields of User. If there's a convenience constructor that should be defined for User, you can do it like this:

```ts
/// Convenience initializer with defaults.
static makeWithFirstName(firstName: string): User {
  return User.create({
    notificationsSent: 0,
    id: randomUUID(),
    firstName,
    lastLogInTs: new Date().toISOString(),
    settings: { notificationsEnabled: false },
  });
}
```

### Non-string Keys

All key properties have to be of type `string`.

### Index Types

All indexes are of projection type `ProjectionType.ALL`.

### Increment on Optionals

Properties that can be incremented atomically via `incrementObject` have to have type `number`, so this won't work:

```ts
notificationsSent?: number;
```
