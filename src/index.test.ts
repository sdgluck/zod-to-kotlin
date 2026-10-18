/**
 * zod → Kotlin, one test per shape, asserting on the generated source. The
 * compile-and-decode proof lives with a consumer that has Gradle and the
 * kotlinx.serialization plugin (Tinkerbell's `:core:model` tests); a bare
 * `kotlinc` can't apply the plugin, so there is nothing honest to run here.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { generateKotlin } from "./index.ts";

const int = () => z.number().meta({ format: "int64" });
const kotlin = (schema: z.ZodType, extra: Partial<Parameters<typeof generateKotlin>[1]> = {}) =>
  generateKotlin([{ name: "Root", schema }], { packageName: "test.model", ...extra });

describe("scalars and absence", () => {
  test("int64 numbers are Long, others Double", () => {
    const k = kotlin(z.object({ count: int(), rating: z.number() }));
    assert.match(k, /val count: Long,/);
    assert.match(k, /val rating: Double,/);
  });

  test("only absent-allowed properties default to null", () => {
    const k = kotlin(z.object({ a: z.string().optional(), b: z.string().nullable(), c: z.string().nullable().optional() }));
    assert.match(k, /val a: String\? = null,/);
    assert.match(k, /val b: String\?,/);
    assert.match(k, /val c: String\? = null,/);
  });

  test("records are maps, unknown is JsonElement", () => {
    const k = kotlin(z.object({ pins: z.record(z.string(), z.array(z.string())), meta: z.unknown() }));
    assert.match(k, /val pins: Map<String, List<String>>,/);
    assert.match(k, /val meta: JsonElement\? = null,/);
  });

  test("an empty object is a class with value equality", () => {
    const k = kotlin(z.object({}));
    assert.match(k, /class Root \{/);
    assert.match(k, /override fun equals\(other: Any\?\) = other is Root/);
  });
});

describe("enums", () => {
  test("entries are SCREAMING_SNAKE with their wire value, and unknowns decode to UNKNOWN", () => {
    const k = kotlin(z.enum(["item-added", "newToMe", "3d", "unknown"]));
    assert.match(k, /ITEM_ADDED\("item-added"\),/);
    assert.match(k, /NEW_TO_ME\("newToMe"\),/);
    assert.match(k, /V_3D\("3d"\),/);
    assert.match(k, /UNKNOWN_VALUE\("unknown"\),/);
    assert.match(k, /\?: UNKNOWN/);
    assert.match(k, /PrimitiveSerialDescriptor\("test\.model\.Root", PrimitiveKind\.STRING\)/);
  });
});

describe("unions", () => {
  test("a sealed interface with a wrapper per tag, reading the tag before choosing", () => {
    const Signed = z.object({ status: z.literal("ok"), token: z.string() }).meta({ id: "SignedFixture" });
    const k = kotlin(z.discriminatedUnion("status", [z.object({ status: z.literal("open") }), Signed]));
    assert.match(k, /sealed interface Root \{/);
    assert.match(k, /data class Open\(val value: OpenValue\) : Root/);
    assert.match(k, /data class Ok\(val value: SignedFixture\) : Root/);
    assert.match(k, /element\.jsonObject\["status"\]\?\.jsonPrimitive\?\.content/);
    assert.match(k, /"ok" -> Ok\(input\.json\.decodeFromJsonElement\(SignedFixture\.serializer\(\), element\)\)/);
  });

  test("a boolean tag matches on its string content", () => {
    const k = kotlin(
      z.discriminatedUnion("ok", [z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), why: z.string() })]),
    );
    assert.match(k, /"true" -> OkTrue\(/);
    assert.match(k, /"false" -> OkFalse\(/);
  });
});

describe("naming and layout", () => {
  test("inline objects nest in the class body, singular for lists", () => {
    const k = kotlin(z.object({ members: z.array(z.object({ name: z.string() })) }));
    assert.match(k, /data class Root\(\n {4}val members: List<Member>,\n\) \{\n {4}@Serializable\n {4}data class Member\(/);
  });

  test("dotted and keyword keys get Kotlin names and keep their wire key", () => {
    const k = kotlin(z.object({ "tab.match": z.boolean(), object: z.boolean() }));
    assert.match(k, /@SerialName\("tab\.match"\) val tabMatch: Boolean,/);
    assert.match(k, /val `object`: Boolean,/);
  });

  test("namespaced roots go in an object, and afterNamespace gets types and serializers", () => {
    const k = generateKotlin(
      [
        { namespace: "Api", name: "Thing", schema: z.object({ a: z.string() }) },
        { namespace: "Api", name: "Films", schema: z.array(z.object({ title: z.string() })) },
      ],
      {
        packageName: "test.model",
        itemName: () => "Film",
        afterNamespace: (_ns, refs) => [...refs].map(([n, r]) => `// ${n} ${r.type} ${r.serializer}`),
      },
    );
    assert.match(k, /object Api \{/);
    assert.match(k, /\/\/ Thing Api\.Thing Api\.Thing\.serializer\(\)/);
    assert.match(k, /\/\/ Films List<Api\.Film> ListSerializer\(Api\.Film\.serializer\(\)\)/);
  });

  test("the file starts with the header, the suppressions and the package", () => {
    const k = kotlin(z.string(), { header: ["Generated."], suppress: ["unused"] });
    assert.match(k, /^\/\/ Generated\.\n@file:Suppress\("unused"\)\n\npackage test\.model\n/);
  });

  test("the same input gives the same bytes", () => {
    const schema = z.object({ a: z.string(), b: z.enum(["x", "y"]) });
    assert.equal(kotlin(schema), kotlin(schema));
  });
});
