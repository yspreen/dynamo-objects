# @spreen/dynamo-objects

## Type Safe DynamoDB Objects in TypeScript

Example usage:

```ts
import {
  DynamoObject,
  ensureTable,
  getMeta,
  getObject,
  getObjects,
  incrementObject,
  putObject,
  updateObject,
} from "@spreen/dynamo-objects";
import { randomUUID } from "crypto";

const STAGING = process.env.STAGING ?? false;

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

(async () => {
  await ensureTable(User);
  await ensureTable(Message);

  const user = User.makeWithFirstName("Alice");
  await putObject(user);
  const newCount = await incrementObject(user, "notificationsSent");
  if (newCount !== undefined) {
    /// Updated successfully.
    user.notificationsSent = newCount;
  }

  user.settings.notificationsEnabled = true;
  /// Make sure only the settings field is written to the database.
  await updateObject(user, ["settings"]);

  /// Since User does not have a sort key, we only need to provide one value when querying:
  await getObject(User, "id");
  /// This will result in a TS error:
  // await getObject(User, "id", "sort key");

  /// Since Message does have a sort key, we have to provide both keys:
  await getObject(Message, "alice", "123");
  /// This will result in a TS error:
  // await getObject(Message, "alice");

  /// Query without index:
  await getObjects(Message, { partitionKey: "alice" });

  /// Query without index:
  await getObjects(Message, "indexName", { partitionKey: "alice" });
  /// This will result in a TS error:
  // await getObjects(Message, "indexName", { partitionKey: "part", sortKey: "sort" });
  /// This works because this index does have a sort key:
  await getObjects(Message, "indexWithSortKey", {
    partitionKey: "part",
    sortKey: "sort",
  });
  /// You can also query this index with only the partition key:
  await getObjects(Message, "indexWithSortKey", { partitionKey: "part" });
})().catch(console.error);
```
