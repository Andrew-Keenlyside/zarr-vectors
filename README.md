# Zarr Vectors Convention Metadata

- **UUID**: 66268a61-7833-4995-bbcb-233bb417dae5
- **Name**: zarr_vectors
- **Schema URL**: "https://raw.githubusercontent.com/Andrew-Keenlyside/zarr-vectors/refs/tags/v0.1.0/schema.json"
- **Spec URL**: "https://github.com/Andrew-Keenlyside/zarr-vectors/blob/v0.1.0/README.md"
- **Convention version**: 0.1.0, covering Zarr Vectors format **0.10.0**
- **Format specification**: [Zarr Vectors format spec at commit `f587ec5`](https://github.com/AllenInstitute/zarr_vectors/tree/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs) ([rendered, unversioned](https://alleninstitute.github.io/zarr_vectors/))
- **Scope**: Array, Group
- **Extension Maturity Classification**: Proposal
- **Owner**: @Andrew-Keenlyside, @fcollman

## Description

This convention defines the metadata of a **Zarr Vectors** store: a Zarr v3 hierarchy holding large N-dimensional _vector_ data, in which each entity's position is given by its coordinates rather than by its index into a dense array. Point clouds, meshes, skeletons, graphs, streamlines, polylines and tracks through time all share one storage model.

**What this convention is, and what it is not.** Zarr Vectors is a file format that uses Zarr as its container. The byte layouts inside each cell (fragment index, manifest blocks, link records) are defined by the [format specification](https://github.com/AllenInstitute/zarr_vectors/tree/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs). This convention is the **metadata layer** of that format. It tells a reader that a node belongs to a Zarr Vectors store, what role the node plays, and how to interpret the cells. It does not define the cell encodings.

**Safely ignorable.** All properties live under one attribute key, `zarr_vectors`, so a tool that does not know the convention can ignore them. Removing them does not change how any array is encoded or stored. The payloads, however, are opaque without the format specification. A generic Zarr reader can open every array and read each cell as a byte string, but it cannot interpret those bytes. Per-chunk arrays use the variable-length [`bytes`](https://github.com/zarr-developers/zarr-extensions/tree/main/data-types/bytes) data type and the [`vlen-bytes`](https://github.com/zarr-developers/zarr-extensions/tree/main/codecs/vlen-bytes) codec. Both are Zarr v3 **extensions**, not core types, so a Zarr implementation needs to support them to read the arrays at all.

**Storage model in brief.** Space is divided into a regular grid. Each per-chunk array (`vertices`, `vertex_fragments`, `links/<delta>/<offsets>`, `vertex_attributes/<name>`, …) is one Zarr array over that grid, with one cell per spatial chunk. Vertices in a chunk are partitioned into _fragments_. Objects (a mesh, a neuron, a streamline) are lists of fragments across chunks, recorded in a per-object manifest. Links are records whose path segment says which neighbouring chunk, and which resolution level, each endpoint lives in. Resolution levels are bare-integer sub-groups (`0/`, `1/`, …) described by the registered [multiscales](https://github.com/zarr-conventions/multiscales) convention.

- Examples (each is a complete `zarr.json`):
  - Root groups: [point cloud with a two-level pyramid](examples/root_group.json), [minimal 2-D store](examples/minimal_root_group.json), [geospatial store composed with `proj`](examples/geospatial_root_group.json), [sharded store with dense object indexes](examples/sharded_dense_root_group.json)
  - Level groups: [level 0](examples/level0_group.json), [level 1](examples/level1_group.json)
  - Per-chunk arrays: [`vertices`](examples/vertices_array.json), [`vertex_fragments`](examples/vertex_fragments_array.json), [`vertex_attribute`](examples/vertex_attribute_array.json), [`links`](examples/links_array.json), [sharded `vertices`](examples/vertices_sharded_array.json)
  - Family groups and per-object arrays: [`links_family`](examples/links_family_group.json), [`object_index` (v2)](examples/object_index_group.json), [`object_index` (v1)](examples/object_index_v1_group.json), [`object_index` (dense)](examples/object_index_dense_group.json), [`object_attribute`](examples/object_attribute_array.json), [`groups`](examples/groups_array.json)
  - Parametric objects: [`parametric/` group](examples/parametric_group.json), [`parametric/objects`](examples/parametric_objects_array.json)
  - [Invalid documents](examples/invalid/) that the schema must reject

## Motivation

- **One format for many geometries**: point clouds, meshes, skeletons, graphs and streamlines share one model (vertices, fragments, links, objects and groups). Tools can share spatial queries, pyramids and attribute access instead of keeping one format per geometry (LAS, PLY, OBJ, SWC, TRX, Neuroglancer precomputed).
- **Spatial queries on object stores**: data are bucketed by spatial chunk, so a reader fetches only the cells a bounding box touches, and only the attribute channels it needs, straight from S3, GCS or Azure Blob.
- **Uncoordinated distributed writes**: every spatial chunk is its own Zarr chunk and fragment numbering is chunk-local, so independent writers can author different chunks without a global vertex-ID scheme.
- **Native multi-resolution**: per-object pyramids keep object identity across levels.
- **Use cases**: connectomics (skeletons, meshes), tractography (streamlines; a single-chunk store aligns with TRX), spatial transcriptomics (cells with thousands of per-cell channels), and large microscopy and LiDAR point clouds.

## Convention Registration

Every node that carries a `zarr_vectors` attribute MUST list this convention in `zarr_conventions`, as the [Zarr Conventions specification](https://github.com/zarr-conventions/zarr-conventions-spec) requires of each conforming node. On the root group, use the full entry:

```json
{
  "schema_url": "https://raw.githubusercontent.com/Andrew-Keenlyside/zarr-vectors/refs/tags/v0.1.0/schema.json",
  "spec_url": "https://github.com/Andrew-Keenlyside/zarr-vectors/blob/v0.1.0/README.md",
  "uuid": "66268a61-7833-4995-bbcb-233bb417dae5",
  "name": "zarr_vectors",
  "description": "Spatially chunked, multi-resolution N-dimensional vector data (point clouds, meshes, skeletons, streamlines, graphs)"
}
```

On other nodes, writers MAY shorten it to `{"uuid": "66268a61-7833-4995-bbcb-233bb417dae5"}`.

The root group MUST also register the [multiscales](https://github.com/zarr-conventions/multiscales) convention (uuid `d35379db-88df-4056-af3a-620245f8e347`), because it carries a `multiscales` block (see [Multiscales](#multiscales)). A store that records a coordinate reference system MUST register the [proj](https://github.com/zarr-conventions/proj) convention as well.

### Versioning

Two version numbers are involved, and they are independent:

- **The convention version** (`X.Y.Z`, the git tag in the schema and spec URLs) versions this metadata contract. It follows semantic versioning:
  - PATCH: clarifications and fixes that do not change which documents the schema accepts.
  - MINOR: additions that leave every previously valid document valid, such as a new optional field or capability token.
  - MAJOR: anything else, including a new `kind` value, because readers MUST reject kinds they do not know.
  - While MAJOR is `0`, a MINOR bump MAY break compatibility.
- **The format version** (`zarr_vectors.zv_version` on the root) versions the byte layouts inside the cells. Format versions before 0.10.0 were hard breaks that needed a rewrite; 0.9.x stores migrate to 0.10.0 in place, metadata only ([Appendix J](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/15-appendices.md#appendix-j-change-log)).

Each convention version lists the format versions it covers:

| Convention version | Format versions (`zv_version`) |
| ------------------ | ------------------------------ |
| 0.1.0              | `0.10.0`                       |

A reader MUST check `zv_version` and MUST NOT interpret cells of a format version it does not support.

Format 0.10.0 is the first format version described by this convention. Its cell payloads are byte-for-byte those of format 0.9.4; it differs only in where the metadata lives (see [Migrating](#migrating-from-format-09x-metadata)). Because a 0.9.x reader looks up keys by their old locations, the move is a breaking change and takes a new format version: stamping a 0.9.x version on the new layout would tell existing readers to parse it the old way.

## Applicable To

- [x] Group: the store root, resolution levels, and the `links/<delta>`, `link_attributes/<name>/<delta>` and `object_index` family groups
- [x] Array: every per-chunk array, and the per-level `groups`, `object_attributes/<name>` and `group_attributes/<name>` arrays

## Properties

This convention uses the **nested pattern**. All of its properties live in one object under the attribute key `zarr_vectors`. The required `kind` field says what the node is:

| `kind`                  | Node                                               | `node_type`               | Fields                                                    |
| ----------------------- | -------------------------------------------------- | ------------------------- | --------------------------------------------------------- |
| `root`                  | store root                                         | group                     | [Root](#root-metadata)                                    |
| `level`                 | `<level>/`                                         | group                     | [Level](#level-metadata)                                  |
| `vertices`              | `<level>/vertices`                                 | array                     | [Arrays](#array-and-family-metadata)                      |
| `vertex_fragments`      | `<level>/vertex_fragments`                         | array                     | 〃                                                        |
| `link_fragments`        | `<level>/link_fragments`                           | array                     | 〃                                                        |
| `links_family`          | `<level>/links/<delta>`                            | group                     | 〃                                                        |
| `links`                 | `<level>/links/<delta>/<offsets>`                  | array                     | 〃                                                        |
| `vertex_attribute`      | `<level>/vertex_attributes/<name>`                 | array                     | 〃                                                        |
| `fragment_attribute`    | `<level>/fragment_attributes/<name>`               | array                     | 〃                                                        |
| `link_attribute_family` | `<level>/link_attributes/<name>/<delta>`           | group                     | 〃                                                        |
| `link_attribute`        | `<level>/link_attributes/<name>/<delta>/<offsets>` | array                     | 〃                                                        |
| `object_index`          | `<level>/object_index`                             | group                     | 〃                                                        |
| `object_attribute`      | `<level>/object_attributes/<name>`                 | array                     | 〃                                                        |
| `groups`                | `<level>/groups`                                   | array                     | 〃                                                        |
| `group_attribute`       | `<level>/group_attributes/<name>`                  | array                     | 〃                                                        |
| `parametric`            | `parametric/`                                      | group                     | `parametric_types`: `{"<type id>": {name, coefficients}}` |
| `parametric_objects`    | `parametric/objects`                               | array                     | 〃                                                        |
| `parametric_names`      | `parametric/names`                                 | array                     | 〃                                                        |
| `parametric_objects`    | `num_objects`                                      | `max_row_length`, `dtype` | not yet in the format spec                                |
| `parametric_names`      | `num_objects`                                      | —                         | not yet in the format spec                                |

A reader MUST reject a node whose `kind` it does not recognise. Within the `zarr_vectors` object, readers SHOULD ignore fields they do not recognise, and other conventions MAY add prefixed fields (for example `proj:` keys).

**Example** (store root):

```json
{
  "zarr_format": 3,
  "node_type": "group",
  "attributes": {
    "zarr_conventions": [
      {
        "uuid": "66268a61-7833-4995-bbcb-233bb417dae5",
        "name": "zarr_vectors"
      },
      { "uuid": "d35379db-88df-4056-af3a-620245f8e347", "name": "multiscales" }
    ],
    "zarr_vectors": {
      "kind": "root",
      "zv_version": "0.10.0",
      "axes": [
        { "name": "z", "type": "space", "unit": "micrometer" },
        { "name": "y", "type": "space", "unit": "micrometer" },
        { "name": "x", "type": "space", "unit": "micrometer" }
      ],
      "chunk_shape": [200.0, 200.0, 200.0],
      "bounds": [
        [0, 0, 0],
        [1000, 1000, 1000]
      ],
      "geometry_types": ["point_cloud"],
      "base_bin_shape": [50.0, 50.0, 50.0]
    },
    "multiscales": {
      "layout": [{ "asset": "0" }, { "asset": "1" }]
    }
  }
}
```

### Root Metadata

`kind: "root"`, on the store root group.

| Field                   | Type                      | Description                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kind                    | `"root"`                  | **REQUIRED**.                                                                                                                                                                                                                                                                                                                                                  |
| zv_version              | string                    | **REQUIRED**. Format version. Convention 0.1.0 accepts `"0.10.0"` only.                                                                                                                                                                                                                                                                                        |
| axes                    | \[object]                 | **REQUIRED**. One `{name, type, unit?}` per coordinate axis, in the order `time → channel → custom → space`. `type` is `space`, `time`, `channel` or `custom`, and at least one axis MUST be `space`. `sid_ndim`, the number of spatial-index dimensions, is the number of `space` axes. `unit` is a UDUNITS-2 name; writers MUST NOT stamp placeholder units. |
| chunk_shape             | \[number]                 | **REQUIRED**. Level-0 chunk edge lengths, one positive entry per space axis.                                                                                                                                                                                                                                                                                   |
| bounds                  | \[\[number], \[number]]   | **REQUIRED**. Global `[min_corner, max_corner]` containing all data. Root-only.                                                                                                                                                                                                                                                                                |
| geometry_types          | \[string]                 | **REQUIRED**. Geometries present; empty in a store that holds no data yet. Canonical values: `point_cloud`, `line`, `polyline`, `streamline`, `skeleton`, `graph`, `mesh`. Writers MAY add others; a reader SHOULD treat an unknown geometry as raw vertex and link arrays.                                                                                    |
| base_bin_shape          | \[number]                 | Level-0 bin edge lengths. `chunk_shape / base_bin_shape` MUST be an integer on every axis. Default: `chunk_shape` (one bin per chunk).                                                                                                                                                                                                                         |
| coordinate_offset       | \[number]                 | Stored-to-world offset per axis: world position = stored position + offset. Absent means zero.                                                                                                                                                                                                                                                                 |
| links_convention        | string                    | `"explicit"`, `"implicit_sequential"` (default) or `"implicit_sequential_with_branches"`.                                                                                                                                                                                                                                                                      |
| object_index_convention | string                    | `"standard"` (default) or `"identity"`. `"identity"` omits `object_index/` and is allowed only in a store with exactly one spatial chunk.                                                                                                                                                                                                                      |
| cross_chunk_strategy    | string                    | `"explicit_links"` (default), `"boundary_deduplication"` or `"both"`.                                                                                                                                                                                                                                                                                          |
| reduction_factor        | integer ≥ 2               | A new level is emitted only when the vertex count drops by at least this factor. Default `8`.                                                                                                                                                                                                                                                                  |
| cross_level_depth       | integer ≥ -1              | Largest \|delta\| materialised for cross-level link arrays: `0` none, `N` up to ±N, `-1` every level pair. Default `1`.                                                                                                                                                                                                                                        |
| cross_level_storage     | string                    | `"none"`, `"implicit"` or `"explicit"` (default).                                                                                                                                                                                                                                                                                                              |
| format_capabilities     | \[string]                 | Capability tokens; see below. Default `[]`.                                                                                                                                                                                                                                                                                                                    |
| attribute_specs         | object                    | Declared attributes by scope (`vertex`, `fragment`, `link`, `object`, `group`), each `{name: {dtype, unit?}}`. A declaration does not promise that the array exists.                                                                                                                                                                                           |
| shard_shape             | integer ≥ 1 \| \[integer] | Writer default: cells per shard, per axis or one value for all axes. Each array's own `zarr.json` remains the truth about that array.                                                                                                                                                                                                                          |
| octree_sharding         | object                    | Writer default: configuration of the octree sharding codec, used instead of `sharding_indexed`. Requires `shard_shape`.                                                                                                                                                                                                                                        |
| manifest_layout         | string                    | Writer default for new object indexes: `"vlen"` (default) or `"dense"`. Each index's own `layout` is the truth about that index.                                                                                                                                                                                                                               |
| manifest_block_dtype    | string                    | `"int64"` (default) or `"int32"`, for the `manifest_blocks` of new dense indexes.                                                                                                                                                                                                                                                                              |
| required_capabilities   | \[string]                 | Capability tokens a reader MUST support to read the store at all. Each also appears in `format_capabilities`.                                                                                                                                                                                                                                                  |

There is no `crs` field. A store with a coordinate reference system records it with the [proj](https://github.com/zarr-conventions/proj) convention (`proj:code`, `proj:wkt2` or `proj:projjson`) on the root group.

#### format_capabilities

| Token                  | Meaning                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fragment_index`       | `vertex_fragments` and `link_fragments` use the v1 fragment-index layout. Every 0.9 store uses it whether or not the token is present, so writers MAY omit it.                                                                                                               |
| `shared_fragments`     | At least one level has fragments referenced by more than one object's manifest.                                                                                                                                                                                              |
| `preserved_object_ids` | At least one level inherits its parent's object-ID space, so dropped objects keep empty manifest slots.                                                                                                                                                                      |
| `multiscale_links`     | The store contains cross-level link arrays (`delta ≠ 0`). It says nothing about links that cross chunk boundaries.                                                                                                                                                           |
| `dense_manifests`      | At least one object index uses the `dense_manifests_v1` layout.                                                                                                                                                                                                              |
| `octree_sharding`      | Sharded per-chunk arrays use the octree sharding codec instead of `sharding_indexed`; reading them needs that codec.                                                                                                                                                         |
| `octree_chunks`        | A level stores one cell per octree leaf rather than per uniform chunk. A reader without this capability MUST NOT read such a level. Its per-chunk arrays also carry the `zarr_vectors_octree_chunks` marker codec, so a plain Zarr reader stops rather than misreading them. |

The set is open. A reader that meets an unknown token MUST either treat the feature as absent or refuse to open the store; it MUST NOT assume the feature is present. A reader MUST refuse to open a store whose `required_capabilities` lists a token it does not support.

### Multiscales

The root group carries a `multiscales` block defined by the [multiscales convention v0.1](https://github.com/zarr-conventions/multiscales/blob/v0.1/README.md), with one `layout` entry per resolution level:

```json
"multiscales": { "layout": [{ "asset": "0" }, { "asset": "1" }, { "asset": "2" }] }
```

- `asset` is the level group's name (`"0"`, `"1"`, …). Level `"0"` is full resolution and MUST be present.
- Writers SHOULD NOT write a `transform`. If one is present, it MUST be the identity: `scale` all `1`, and `translation` all `0`. The multiscales convention's transform describes how _coordinates_ change between levels, and in a Zarr Vectors store they do not. Every level's vertices are stored in level-0 coordinates.
- `derived_from` MAY be present. If it is, it MUST equal the level's `parent_level`.

Bin geometry is Zarr Vectors' own and is stored once, outside this block: level 0's bin is the root `base_bin_shape`, and each coarse level's `bin_shape` and `bin_ratio` (relative to `base_bin_shape`) sit in its [level object](#level-metadata). Earlier drafts put the bin ratio in `transform.scale`, which told generic multiscales tools that the coordinates were rescaled.

### Level Metadata

`kind: "level"`, on each resolution-level group.

| Field                  | Type              | Description                                                                                                                                                                                         |
| ---------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kind                   | `"level"`         | **REQUIRED**.                                                                                                                                                                                       |
| level                  | integer ≥ 0       | **REQUIRED**. Level index; MUST equal the group name.                                                                                                                                               |
| parent_level           | integer \| null   | The level this one was coarsened from, and whose object-ID space it inherits when `preserves_object_ids` is true. `null` (or absent) at level 0.                                                    |
| bin_shape              | \[number] \| null | This level's bin edge lengths. Absent or `null` at level 0, whose bin is the root `base_bin_shape`.                                                                                                 |
| bin_ratio              | \[number] \| null | `bin_shape / base_bin_shape` per axis, as a float that MUST NOT be rounded. Absent or `null` at level 0.                                                                                            |
| presence               | `"deferred"`      | Set while the level's per-chunk arrays carry no `nonempty_chunks` (a distributed build in progress); readers then list the store.                                                                   |
| link_fragments_aligned | boolean           | `true` when every chunk's link fragments align with its vertex fragments.                                                                                                                           |
| octree_chunks          | object            | Present when the level stores one cell per octree leaf (see the `octree_chunks` capability).                                                                                                        |
| vertex_count           | integer ≥ 0       | Total vertex rows across all `vertices` cells at this level.                                                                                                                                        |
| arrays_present         | \[string]         | Family names present at this level, such as `"vertex_attributes"` (never `"vertex_attributes/<name>"`).                                                                                             |
| fragments_tile         | boolean           | `true` when every chunk's fragment index tiles its vertex buffer exactly, so a bulk read may skip `vertex_fragments`. Any write to `vertices` or `vertex_fragments` MUST clear it. Default `false`. |
| chunk_shape            | \[number]         | Per-level chunk-shape override. Each axis MUST be a positive integer multiple of the root `chunk_shape` and an integer multiple of this level's bin size.                                           |
| object_sparsity        | number in (0, 1]  | Fraction of the parent level's objects kept at this level.                                                                                                                                          |
| coarsening_method      | string            | `"per_object"`, `"manual"` or `"none"`.                                                                                                                                                             |
| chunk_dims             | \[string]         | Names of the chunk-key axes, leading axis first, when the store was rechunked along a non-spatial axis.                                                                                             |
| chunk_attribute_name   | string            | Per-vertex attribute used as the leading chunk axis.                                                                                                                                                |
| chunk_attribute_values | \[any]            | Ordered map from leading-axis chunk coordinate to attribute value.                                                                                                                                  |
| preserves_object_ids   | boolean           | `true` when this level inherits its parent's object-ID space. MUST be `false` at level 0. Default `false`.                                                                                          |
| inherited_num_objects  | integer ≥ 0       | Size of the inherited object-ID space. **REQUIRED** when `preserves_object_ids` is `true`.                                                                                                          |
| shared_fragments       | boolean           | `true` when fragments at this level may be referenced by several manifests. Default `false`.                                                                                                        |

`bounds` MUST NOT appear here; it is root-only. Fields whose value is `null` mean the same as absent.

### Array and Family Metadata

| `kind`                  | Required fields                                                                                                                                          | Optional fields                                                                     | Format spec                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `vertices`              | `dtype`, `encoding` (`"raw"` \| `"draco"`)                                                                                                               | `shape`, `compression_codec`                                                        | [§7.1](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/07-core-arrays.md#71-vertex-positions)                          |
| `vertex_fragments`      | `encoding` = `"fragment_index_v1"`                                                                                                                       | —                                                                                   | [§7.3](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/07-core-arrays.md#73-vertex-fragments)                          |
| `link_fragments`        | `encoding` = `"fragment_index_v1"`                                                                                                                       | —                                                                                   | [§7.5](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/07-core-arrays.md#75-vertex-links)                              |
| `links_family`          | `level_delta`, `link_width`, `directed`, `store` (`"canonical"` \| `"duplicate"`)                                                                        | `sid_ndim`, `num_links`, `num_physical_records`                                     | [§10.6](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/10-cross-chunk-linking.md#106-on-disk-layout-the-links-family) |
| `links`                 | `dtype`, `offsets`, `has_perm`, `link_width`, `level_delta`                                                                                              | —                                                                                   | [§10.6](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/10-cross-chunk-linking.md#106-on-disk-layout-the-links-family) |
| `vertex_attribute`      | `name`, `dtype`, `row_shape`                                                                                                                             | `channel_names`, `channel_dtype`                                                    | [§7.2](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/07-core-arrays.md#72-vertex-attributes)                         |
| `fragment_attribute`    | `name`, `dtype`, `row_shape`                                                                                                                             | `channel_names`, `channel_dtype`                                                    | not yet in the format spec ([open question](#open-questions))                                                                                                            |
| `link_attribute_family` | `name`, `level_delta`                                                                                                                                    | —                                                                                   | [§7.7](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/07-core-arrays.md#77-link-attributes)                           |
| `link_attribute`        | `name`, `dtype`, `row_shape`, `offsets`, `level_delta`                                                                                                   | `channel_names`                                                                     | [§7.7](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/07-core-arrays.md#77-link-attributes)                           |
| `object_index`          | — (an index created before any object is written MAY carry only `kind`; once it holds manifests, `num_objects`, `sid_ndim` and `layout` MUST be present) | `layout` (`"vlen_manifests_v1"` \| `"vlen_manifests_v2"` \| `"dense_manifests_v1"`) | `num_objects`, `sid_ndim`, `num_present`, `object_ids_sorted`                                                                                                            | [§7.6](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/07-core-arrays.md#76-object-index) |
| `object_attribute`      | `name`, `dtype`                                                                                                                                          | `shape`, `channel_names`, `fill_sentinel_meaning` = `"absent"`                      | [§7.8](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/07-core-arrays.md#78-object-attributes)                         |
| `groups`                | `num_groups`                                                                                                                                             | `group_ranges`                                                                      | [§7.4](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/07-core-arrays.md#74-groups)                                    |
| `group_attribute`       | `name`, `dtype`                                                                                                                                          | `shape`, `channel_names`                                                            | [§7.4](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/07-core-arrays.md#74-groups)                                    |

The `object_index/manifests` and `object_index/object_ids` arrays carry no `zarr_vectors` attribute; their parent group describes them.

#### Zarr array requirements

The **per-chunk** kinds (`vertices`, `vertex_fragments`, `link_fragments`, `links`, `vertex_attribute`, `fragment_attribute`, `link_attribute`), `groups` and `parametric_names` are Zarr arrays with:

- `data_type`: the zarr-extensions variable-length [`bytes`](https://github.com/zarr-developers/zarr-extensions/tree/main/data-types/bytes) type. Writers SHOULD spell it `"bytes"`. Readers MUST also accept `"variable_length_bytes"`, the spelling zarr-python 3.x writes.
- a `vlen-bytes` codec, either directly in `codecs` or, for a sharded array, as a cell codec in the sharding codec's `configuration.codecs` (`sharding_indexed`, or the octree sharding codec).
- for per-chunk kinds, `shape` equal to the level's chunk grid, with one cell per spatial chunk.

#### Per-chunk fields

The per-chunk kinds MAY also carry these fields. No other kind may carry them.

| Field             | Type       | Description                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| nonempty_chunks   | \[string]  | A **cache** of the occupied cells, as dot-separated chunk keys (`"0.0.1"`), so a reader can enumerate them without listing the store. It is derived by a coordinator after writes complete; independent per-cell writers MUST NOT update it. It MAY be stale while uncoordinated writes are in progress. A reader that needs a complete answer MUST list the store instead. |
| chunk_grid_origin | \[integer] | Absolute chunk coordinate of cell `(0, …, 0)`, equal to `floor(bounds.min_corner / level chunk_shape)`. Present only when non-zero; when absent, chunk coordinates are array indices.                                                                                                                                                                                       |

### Additional Field Information

- **dtype**: the cells are byte strings, so the element type of the rows inside a cell is declared here as a NumPy dtype name (`"float32"`, `"int64"`, …). A reader MUST take it from this field.
- **row_shape**: `[]` for a scalar attribute, `[C]` for a `C`-channel one. It is the authority on column count; `channel_names` are only labels.
- **offsets and has_perm**: `offsets` lists the `link_width - 1` signed chunk offsets, relative to the source chunk, at which a record's other endpoints live. It is empty when `link_width` is 1, and the array's path segment carries the same information. `has_perm` is true exactly when the offsets are non-zero, `level_delta` is 0, and either the family's `store` is `"duplicate"` or `directed` is false. In that case each row carries one extra permutation column.
- **layout** (object_index): `vlen_manifests_v1` maps an object's ID to its row number. `vlen_manifests_v2` stores the IDs in a sibling `object_ids` array, so IDs may be sparse and 64-bit; `object_ids_sorted: true` says the IDs ascend. `dense_manifests_v1` replaces the per-object byte blobs with fixed-width integer arrays: `manifest_spans` (`(n_objects, 2)`, start and count) indexing `manifest_blocks` (`(n_blocks, sid_ndim + 1)`, chunk coordinates then fragment index), with `object_ids` as in v2. A reader MUST reject any other layout rather than guess at it.

### Rules the schema does not check

The JSON schema validates one node at a time. These rules span nodes or fields, and validators such as `zarr_vectors.validate` in zarr-vectors-py check them:

- `chunk_shape`, `base_bin_shape`, both `bounds` corners, `coordinate_offset`, and each level's `bin_shape` and `bin_ratio` have one entry per `space` axis.
- `chunk_shape / base_bin_shape` is an integer per axis, and each level's `chunk_shape` meets the multiple rules above.
- The `multiscales` assets match the level groups one to one, and each level group's `level` equals its name.
- Each coarse level's `parent_level` names an existing level, the chain reaches level 0 without cycles, and `bin_ratio` equals `bin_shape / base_bin_shape`.
- In `links`, `offsets` has `link_width - 1` entries, each of length `sid_ndim`, and `has_perm` follows the rule above.
- Each per-chunk array's `shape` equals its level's chunk grid, and `nonempty_chunks` keys fall inside it.

## Composability

- **multiscales**: the root's `multiscales` block is the registered multiscales convention, so generic multiscales tools can list the levels. Its `asset` entries point at groups, which that convention allows. It carries no transform, because vertex coordinates do not change between levels.
- **proj**: coordinate reference systems use the proj convention on the root group; see [the geospatial example](examples/geospatial_root_group.json).
- **OME-Zarr collections (RFC 8)**: the root MAY carry an `ome` object that is an OME-Zarr RFC 8 `collection` node, with one `zv:level` leaf per resolution level and a `scene` declaring a `world` coordinate system. It lets an OME collection elsewhere name this store by path. It only restates fields held in `zarr_vectors`, which stay authoritative. Readers of this convention MUST NOT depend on it.
- **OME-NGFF**: a Zarr Vectors store is **not** an OME-Zarr image and does not carry NGFF metadata. NGFF's `multiscales.datasets` must point at image arrays, and its axes are limited to 2–3 space dimensions. Neither fits vector data, so earlier drafts that reused the NGFF block made generic NGFF viewers misread the store.
- **Extending Zarr Vectors**: the `zarr_vectors` object allows additional properties. Other conventions MAY add prefixed keys to it.

## Migrating from format 0.9.x metadata

zarr-vectors-py implements this as `zarr_vectors.building.migrate_metadata_0_10(path)`, and refuses an unmigrated store with an error that names it.

zarr-vectors-py 0.9.x (0.9.4 on `main`) writes an earlier, unregistered layout. Fields added in 0.9.3 and 0.9.4 (`shard_shape`, `octree_sharding`, `manifest_layout`, `manifest_block_dtype`, `required_capabilities`) keep their names and move with the rest of the root object. Only metadata moves; no cell is rewritten, so a store migrates in place by rewriting its `zarr.json` documents and setting `zv_version` to `"0.10.0"`:

| 0.9.x location                                                 | Convention 0.1.0 location                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| root `attributes.zarr_vectors.{…}`                             | `attributes.zarr_vectors.{kind: "root", …}`                                                                                                                                                                                                   |
| root `attributes.zarr_vectors.crs`                             | `proj:projjson` (or `proj:code` / `proj:wkt2`) on the root, plus the proj registration                                                                                                                                                        |
| root `attributes.multiscales[0].axes`                          | `attributes.zarr_vectors.axes`                                                                                                                                                                                                                |
| root `attributes.multiscales[0].datasets[i]` (NGFF 0.4)        | `attributes.multiscales.layout[i]` = `{"asset": path}`. A coarse level whose bins were only in its NGFF entry (stores older than per-level bins) gets them copied into its level object as `bin_ratio` = scale, `bin_shape` = 2 × translation |
| root `attributes.multiscales[0].metadata.format`               | dropped (`kind: "root"` identifies the store)                                                                                                                                                                                                 |
| level `attributes.zarr_vectors_level.{…}`                      | `attributes.zarr_vectors.{kind: "level", …}`                                                                                                                                                                                                  |
| level top-level `zarr_vectors_presence`                        | the level object's `presence`                                                                                                                                                                                                                 |
| array `attributes.zv_array` + bare fields (`dtype`, `name`, …) | `attributes.zarr_vectors.{kind, dtype, name, …}`                                                                                                                                                                                              |
| `zv_array: "attribute"`                                        | `kind: "vertex_attribute"`                                                                                                                                                                                                                    |
| `zv_array: "groupings_attribute"`                              | `kind: "group_attribute"`                                                                                                                                                                                                                     |
| `parametric/` top-level `parametric_types`                     | `attributes.zarr_vectors.{kind: "parametric", parametric_types}`                                                                                                                                                                              |
| no registration                                                | `zarr_conventions` on every node above                                                                                                                                                                                                        |

## Open Questions

1. **Spec and implementation disagree.** zarr-vectors-py writes `object_index.layout` values `"vlen_manifests_v2"` and `"dense_manifests_v1"`, `fragment_attributes/<name>` arrays and octree-chunked levels, but the format specification at the pinned commit defines only `vlen_manifests_v1` and covers none of the others. This convention accepts what the reference writer produces. The format specification's `spec-0.10` branch covers all of these; the links move to it once it merges.
2. **Format spec versioning.** The format spec repository has no tags, so links are pinned to commit `f587ec5`. Format 0.10.0 reuses the 0.9.4 cell layouts, which that commit does not fully describe (see question 1); the links should move to a tag once the format spec repository has one.
3. **Format spec licence.** The format specification is published under the Allen Institute Software License, which prohibits commercial use. A community convention that normatively references it will need it under a permissive licence (for example CC-BY-4.0).
4. **`bounds` inclusivity.** Neither this convention nor the format spec says whether `max_corner` is inclusive. With `bounds` 0–1000 and `chunk_shape` 200, the answer decides whether chunk index 5 exists.
5. **`bytes` vs `variable_length_bytes`.** Writers SHOULD use the registered name, but zarr-python 3.x writes the other. Readers must accept both until zarr-python changes.

## Known Implementations

zarr-vectors-py implements this convention version on its `format-0.10-convention` branch (format 0.10.0), which also validates the stores its writers produce against this repository's schema in its test suite. No release emits it yet.

- **zarr-vectors-py**: reference reader, writer and validator. Its current releases (format 0.9.2–0.9.4) write the pre-convention metadata layout described in [Migrating](#migrating-from-format-09x-metadata).
  - Language: Python
  - Repository: https://github.com/AllenInstitute/zarr-vectors-py
  - Status: Experimental
  - Maintainers: @Andrew-Keenlyside, @fcollman
- **zarr-vectors-tools**: converters to and from TRX and other formats
  - Language: Python
  - Repository: https://github.com/AllenInstitute/zarr-vectors-tools
  - Status: Experimental
  - Maintainer: @Andrew-Keenlyside

The JSON schema in this repository is the normative definition of this metadata. Where the LinkML schema in zarr-vectors-py disagrees with it, this repository wins.

### Datasets Using This Convention

- _None published yet._

### Resources

- [Zarr Vectors format specification](https://alleninstitute.github.io/zarr_vectors/): 15 chapters, with worked examples for point clouds, meshes, skeletons, streamlines and spatial transcriptomics (§14)
- [Mapping from the Neuroglancer precomputed annotation format](https://github.com/AllenInstitute/zarr_vectors/blob/f587ec5e6d9f978a2705c7f8920df04bc08fe428/docs/15-appendices.md#appendix-k-mapping-from-neuroglancer-precomputed-annotations) (Appendix K)

_If you implement or use this convention, please add your implementation to this list by submitting a pull request._

## Acknowledgements

This template is based on the [STAC extensions template](https://github.com/stac-extensions/template/blob/main/README.md). The Zarr Vectors format draws on [TRX](https://github.com/tee-ar-ex/trx-spec), [OME-Zarr](https://ngff.openmicroscopy.org/) and the [Neuroglancer precomputed](https://github.com/google/neuroglancer/tree/master/src/datasource/precomputed) formats.
