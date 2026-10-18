/**
 * zod schemas → Kotlin data classes for kotlinx.serialization.
 *
 * The same decisions as `zod-to-swift`, in Kotlin's terms:
 *
 * - **String enums decode an unknown value to `UNKNOWN`**, so a server that
 *   adds a value doesn't fail an older app's decode. (Keeping the raw string
 *   would need a class rather than an enum; `raw` holds the known ones.)
 * - **Discriminated unions are sealed interfaces with a hand-rolled
 *   serializer** that reads the discriminator first. kotlinx's own
 *   `@JsonClassDiscriminator` needs string tags and forbids the tag as a
 *   property, which rules out boolean tags (`ok: true | false`) and variants
 *   that are shared named shapes.
 * - **Optional properties default to `null`**; with the reader's `Json`
 *   configured `explicitNulls = false` they are omitted on the way out, while
 *   a required-nullable property has no default and is always written.
 *
 * Kotlin has no nested typealias, so a top-level list root has no name of its
 * own: its element is declared (`${root}Item`) and `afterNamespace` is handed
 * the spelled-out `List<…>` type and its serializer.
 */
import { type IRDocument, type NamedSchema } from "zod-native-ir";
export type { NamedSchema } from "zod-native-ir";
/** The wrappers a top-level root can put around the type it names. */
export type Wrapper = "array" | "record" | "nullable";
export interface KotlinOptions {
    /** The `package` the file declares. Also prefixes serial descriptor names. */
    packageName: string;
    /** Comment lines for the top of the file, without the `// `. */
    header?: string[];
    /** Arguments for a `@file:Suppress(...)` line, e.g. `["unused"]`. */
    suppress?: string[];
    /**
     * The name of the shape a top-level root wraps: the element of a list, the
     * value of a map, the object behind an optional. `wrapper` is the one
     * directly around the shape. Default `${root}Item` for a list element and
     * `${root}Value` otherwise.
     */
    itemName?: (root: string, wrapper: Wrapper) => string;
    /**
     * Extra lines after a namespace's `object` — e.g. endpoint descriptors.
     * `refs` maps each root's name to its qualified Kotlin type and a
     * `KSerializer` expression for it.
     */
    afterNamespace?: (namespace: string, refs: Map<string, {
        type: string;
        serializer: string;
    }>) => string[];
}
/**
 * Kotlin source declaring each named schema, plus every `.meta({ id })` shape
 * they reach, once, at the top level. Namespaced roots go in `object <Namespace>`.
 */
export declare function generateKotlin(types: NamedSchema[] | IRDocument, options: KotlinOptions): string;
