# zod-to-kotlin

Generate Kotlin data classes for [kotlinx.serialization](https://github.com/Kotlin/kotlinx.serialization)
from [zod](https://zod.dev) 4 schemas — for an Android or JVM client talking to a
TypeScript server that already describes its API in zod.

```ts
import { z } from "zod";
import { generateKotlin } from "zod-to-kotlin";

const Film = z.object({ ratingKey: z.string(), title: z.string(), year: z.number().int().nullable() }).meta({ id: "Film" });

const source = generateKotlin(
  [
    { name: "DeckOutput", namespace: "Match", schema: z.object({ remaining: z.number().int(), films: z.array(Film) }) },
    { name: "Status", schema: z.enum(["enabled", "disabled"]) },
  ],
  { packageName: "com.example.api" },
);
```

```kotlin
package com.example.api

@Serializable
data class Film(
    val ratingKey: String,
    val title: String,
    val year: Long?,
)

@Serializable(with = Status.Companion::class)
enum class Status(val raw: String) {
    ENABLED("enabled"),
    DISABLED("disabled"),
    UNKNOWN("");
    // companion KSerializer: unknown values decode to UNKNOWN
}

object Match {
    @Serializable
    data class DeckOutput(
        val remaining: Long,
        val films: List<Film>,
    )
}
```

## What it does with each shape

| zod | Kotlin |
| --- | --- |
| `z.string()` | `String` |
| `z.number().int()`, or `z.number().meta({ format: "int64" })` | `Long` |
| `z.number()` | `Double` |
| `z.boolean()` | `Boolean` |
| `.optional()` | `T? = null` |
| `.nullable()` (required) | `T?` with no default — always written |
| `z.array(T)` | `List<T>` |
| `z.record(z.string(), T)` | `Map<String, T>` |
| `z.unknown()` / `z.any()` | `JsonElement? = null` |
| `z.enum([...])` | `enum class` with `raw` values and an `UNKNOWN` fallback |
| `z.discriminatedUnion(key, [...])` | `sealed interface` with a wrapper per tag and a serializer that reads the tag first |
| an inline object | a nested class named after its property (`members: [{…}]` → `Member`) |
| `.meta({ id: "Name" })` | one top-level class, shared by every schema that reaches it |

Shapes without a faithful Kotlin spelling throw a `SchemaError` saying where.

**Why the hand-rolled union serializer.** kotlinx's `@JsonClassDiscriminator`
needs string tags and forbids the tag as a property of the subclass, which
rules out boolean tags (`ok: true | false`) and variants that are shared named
types. Reading the tag from the `JsonElement` and decoding the variant from the
same element handles both.

**Reader configuration.** Use a `Json` with `ignoreUnknownKeys = true` (so a
server adding a field doesn't break an older client) and `explicitNulls = false`
(so optional properties are omitted when `null` rather than sent as `null`).

## API

```ts
generateKotlin(types: NamedSchema[] | IRDocument, options: KotlinOptions): string
```

`NamedSchema` is `{ name, schema, namespace?, io? }` — see
[`zod-native-ir`](https://github.com/sdgluck/zod-native-ir).

| option | |
| --- | --- |
| `packageName` | the file's `package` (required) |
| `header` | comment lines for the top of the file |
| `suppress` | arguments for a `@file:Suppress(...)` line |
| `itemName(root)` | element class of a top-level array root (default `${root}Item`) — Kotlin has no nested typealias, so the list itself has no name |
| `afterNamespace(ns, refs)` | extra lines after each namespace `object`; `refs` maps each root's name to `{ type, serializer }`, e.g. `{ type: "List<Api.Film>", serializer: "ListSerializer(Api.Film.serializer())" }` |

The same schemas through [`zod-to-swift`](https://github.com/sdgluck/zod-to-swift)
give the matching Swift.

## Install

```sh
pnpm add github:sdgluck/zod-to-kotlin#v0.1.1 github:sdgluck/zod-native-ir#v0.1.1
```

`zod-native-ir` is a peer dependency: the generator accepts and returns its
types, so it and your code should share one copy. (Depending on it directly also
keeps pnpm's `blockExoticSubdeps` — on by default since pnpm 11 — happy, since
it refuses git dependencies of dependencies.)

## Requirements

Node 22.18+ and zod 4. The generated code needs Kotlin 1.9+ (`entries`) and the
kotlinx.serialization plugin and JSON runtime.

## License

MIT
