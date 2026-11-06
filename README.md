# Zarr Vectors Convention Metadata

- **UUID**: 66268a61-7833-4995-bbcb-233bb417dae5
- **Name**: zarr_vectors
- **Schema URL**: "https://raw.githubusercontent.com/Andrew-Keenlyside/zarr-vectors/refs/tags/v0.9.2/schema.json"
- **Spec URL**: "https://github.com/Andrew-Keenlyside/zarr-vectors/blob/v0.9.2/README.md"
- **Format specification**: [Zarr Vectors Spec](https://alleninstitute.github.io/zarr_vectors/) ([repo](https://github.com/AllenInstitute/zarr_vectors))
- **Scope**: Array, Group
- **Extension Maturity Classification**: Pilot
- **Owner**: @Andrew-Keenlyside @fcollman @AllenInstitute

## Description

This convention defines the metadata of a **Zarr Vectors** store: a Zarr v3 hierarchy holding large N-dimensional _vector_ data, in which each entity's position is given by its coordinates rather than by its index into a dense array. Point clouds, meshes, skeletons, graphs, streamlines, polylines and tracks through time are all expressed with one storage model. Root properties are nested under the `zarr_vectors` key, and per-level properties under `zarr_vectors_level`. Per-array properties sit at the root `attributes` level beside a `zv_array` discriminator. All of them follow the [Zarr Conventions Specification](https://github.com/zarr-conventions/zarr-conventions-spec).

A Zarr Vectors store is spatially chunked: space is divided into a regular grid, and each per-chunk array (`vertices`, `vertex_fragments`, `links/<delta>/<offsets>`, `vertex_attributes/<name>`, and so on) is one Zarr v3 `variable_length_bytes` array over that grid, with one cell per spatial chunk. Vertices inside a chunk are partitioned into _fragments_. Objects (a mesh, a neuron, a streamline, a cell) are lists of fragments across chunks, recorded in a per-object manifest. Groups partition the objects. Links (edges, faces, parent pointers) are records whose relative-offset path segment says which neighbouring chunk, and which pyramid level, each endpoint lives in. Resolution levels are bare-integer sub-groups (`0/`, `1/`, …), described by an OME-NGFF 0.4 `multiscales` block at the root.

The convention is **safely ignorable**, as the Zarr Conventions framework requires. Every array is an ordinary Zarr v3 array that any Zarr implementation can open and read as bytes. The convention does not change how Zarr encodes or stores data; it only says how the bytes in each cell are framed and what they mean. This README specifies the _metadata_ contract. The byte layouts inside the cells (fragment index, manifest blocks, link records) are normative in the [format specification](https://alleninstitute.github.io/zarr_vectors/), to which each table below links.

- Examples:
  - [Minimal root group](examples/minimal_example.json)
  - [Root group: point cloud with a pyramid](examples/root_group_example.json)
  - [Resolution-level group](examples/level_group_example.json)
  - [`vertices` array](examples/vertices_array_example.json)
  - [`links/0` family group](examples/links_family_example.json)
  - [`object_index` group](examples/object_index_example.json)

## Motivation

- **One format for many geometries**: point clouds, meshes, skeletons, graphs and streamlines share one storage model: vertices, fragments, links, objects and groups. Tools can then share spatial queries, pyramids and attribute access across all of them, instead of keeping one format per geometry (LAS, PLY, OBJ, SWC, TRX, Neuroglancer precomputed).
- **Spatial queries on object stores**: data are bucketed by spatial chunk, and each array lists its occupied cells (`nonempty_chunks`). A reader fetches only the cells a bounding box touches, and only the attribute channels it needs, straight from S3, GCS or Azure Blob.
- **Uncoordinated distributed writes**: every spatial chunk is its own Zarr chunk file, and fragment numbering is chunk-local. Independent writers can therefore author different chunks without a global vertex-ID scheme.
- **Native multi-resolution**: per-object pyramids keep object identity across levels. Coarser levels may grow `chunk_shape`, and optional cross-level link arrays support fragment-level level-of-detail selection.
- **Use case alignment**: built for connectomics (skeletons, meshes), tractography (streamlines; a single-chunk store aligns with TRX), spatial transcriptomics (cells and detections with thousands of per-cell channels) and large microscopy and LiDAR point clouds.

## Convention Registration

The convention must be registered in `zarr_conventions` on **every node that carries Zarr Vectors properties**: the root group, each resolution-level group, and each Zarr Vectors array or family group.

```json
{
  "zarr_conventions": [
    {
      "schema_url": "https://raw.githubusercontent.com/Andrew-Keenlyside/zarr-vectors/refs/tags/v0.9.2/schema.json",
      "spec_url": "https://github.com/Andrew-Keenlyside/zarr-vectors/blob/v0.9.2/README.md",
      "uuid": "66268a61-7833-4995-bbcb-233bb417dae5",
      "name": "zarr_vectors",
      "description": "Spatially chunked, multi-resolution N-dimensional vector data (point clouds, meshes, skeletons, streamlines, graphs)"
    }
  ]
}
```

On non-root nodes, writers MAY shorten the entry to `{"uuid": "66268a61-7833-4995-bbcb-233bb417dae5"}`.

### Versioning

The convention is versioned in step with the format: the tag `vX.Y.Z` of this repository describes Zarr Vectors format `X.Y.Z`, and the same string is stored in `zarr_vectors.zv_version`. Every Zarr Vectors version bump so far has been a hard break with no in-place migration (Appendix J of the format specification). A reader MUST therefore check `zv_version` and MUST NOT read a store whose version it does not support.

## Applicable To

This convention can be used with these parts of the Zarr hierarchy:

- [x] Group: the store root, resolution levels, and the `links/<delta>`, `link_attributes/<name>/<delta>` and `object_index` family groups
- [x] Array: every per-chunk and per-object array

## Properties

All properties are placed at the root `attributes` level. This convention uses the **nested pattern**. Which keys a node carries depends on its role:

| Node                                              | Key                  | Contents                                                |
| ------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| Store root group                                  | `zarr_vectors`       | [Root Metadata Object](#root-metadata-object)           |
| Store root group                                  | `multiscales`        | [Multiscales Block](#multiscales-block) (OME-NGFF 0.4)  |
| Resolution-level group (`0/`, `1/`, …)            | `zarr_vectors_level` | [Level Metadata Object](#level-metadata-object)         |
| Array or family group under a level               | `zv_array` + fields  | [Array Metadata](#array-metadata)                       |

A node carries at most one of `zarr_vectors`, `zarr_vectors_level` and `zv_array`. Which one is present tells a reader the node's role.

**Convention metadata name**: `zarr_vectors`

**Example** (store root):

```json
{
  "zarr_format": 3,
  "node_type": "group",
  "attributes": {
    "zarr_conventions": [{ "name": "zarr_vectors", "uuid": "66268a61-7833-4995-bbcb-233bb417dae5" }],
    "zarr_vectors": {
      "zv_version": "0.9.2",
      "chunk_shape": [200.0, 200.0, 200.0],
      "bounds": [[0, 0, 0], [1000, 1000, 1000]],
      "geometry_types": ["point_cloud"],
      "base_bin_shape": [50.0, 50.0, 50.0],
      "format_capabilities": ["fragment_index", "preserved_object_ids"]
    },
    "multiscales": [
      {
        "version": "0.4",
        "axes": [
          { "name": "z", "type": "space", "unit": "micrometer" },
          { "name": "y", "type": "space", "unit": "micrometer" },
          { "name": "x", "type": "space", "unit": "micrometer" }
        ],
        "datasets": [
          {
            "path": "0",
            "coordinateTransformations": [
              { "type": "scale", "scale": [1.0, 1.0, 1.0] },
              { "type": "translation", "translation": [25.0, 25.0, 25.0] }
            ]
          }
        ],
        "metadata": { "format": "zarr_vectors" }
      }
    ]
  }
}
```

**Example** (resolution level):

```json
{
  "zarr_format": 3,
  "node_type": "group",
  "attributes": {
    "zarr_conventions": [{ "uuid": "66268a61-7833-4995-bbcb-233bb417dae5" }],
    "zarr_vectors_level": {
      "level": 1,
      "parent_level": 0,
      "chunk_shape": [400.0, 400.0, 400.0],
      "coarsening_method": "per_object",
      "preserves_object_ids": true,
      "inherited_num_objects": 41873
    }
  }
}
```

### Root Metadata Object

The `zarr_vectors` object on the store root group. NGFF axes live in the sibling `multiscales` block and are not repeated here. Readers SHOULD ignore keys they do not recognise; writers MAY add custom keys.

| Field Name              | Type                       | Description |
| ----------------------- | -------------------------- | ----------- |
| zv_version              | string                     | **REQUIRED**. Format version, `"X.Y.Z"`. This version of the convention covers `0.9.x`. |
| chunk_shape             | \[number]                  | **REQUIRED**. Level-0 chunk edge lengths, one positive entry per space axis. |
| bounds                  | \[\[number], \[number]]    | **REQUIRED**. Global `[min_corner, max_corner]` containing all data. Root-only; levels have no bounds. |
| geometry_types          | \[string]                  | **REQUIRED**. Geometries present; see [geometry_types](#geometry_types). |
| crs                     | object \| null             | Coordinate reference system, following OME-Zarr RFC 4 / 5. |
| links_convention        | string                     | How intra-chunk links are stored: `"explicit"`, `"implicit_sequential"` (default) or `"implicit_sequential_with_branches"`. |
| object_index_convention | string                     | `"standard"` (default) or `"identity"`. `"identity"` omits `object_index/` and is allowed only in a store with exactly one spatial chunk. |
| cross_chunk_strategy    | string                     | `"explicit_links"` (default), `"boundary_deduplication"` or `"both"`. |
| reduction_factor        | integer ≥ 2                | A new pyramid level is emitted only when the vertex count drops by at least this factor. Default `8`. |
| base_bin_shape          | \[number] \| null          | Level-0 bin edge lengths. `chunk_shape / base_bin_shape` MUST be an integer on every axis. When unset, there is one bin per chunk. |
| cross_level_depth       | integer ≥ -1               | Largest \|delta\| materialised for cross-level link arrays: `0` disables them, `N` writes ±1…±N, and `-1` writes every adjacent pair of levels. Default `1`. |
| cross_level_storage     | string                     | `"none"`, `"implicit"` or `"explicit"` (default). |
| format_capabilities     | \[string]                  | Capability tokens the store uses; see [format_capabilities](#format_capabilities). Default `[]`. |

#### geometry_types

The canonical values are `point_cloud`, `line`, `polyline`, `streamline`, `skeleton`, `graph` and `mesh`. Writers MAY add other values. A reader SHOULD treat an unknown geometry as raw vertex and link arrays; geometry-specific conformance checks do not apply to it.

#### format_capabilities

| Token                  | Meaning |
| ---------------------- | ------- |
| `fragment_index`       | `vertex_fragments` and `link_fragments` use the v1 fragment-index byte layout. Mandatory in 0.9. |
| `shared_fragments`     | At least one level has per-chunk fragments referenced by more than one object's manifest. |
| `preserved_object_ids` | At least one level inherits its parent's object-ID space, so dropped objects keep empty manifest slots. |
| `multiscale_links`     | The store contains cross-pyramid-level link arrays (`delta ≠ 0`). It says nothing about links that cross chunk boundaries. |

The set is open. A reader that meets an unknown token MUST either treat the feature as absent or refuse to open the store; it MUST NOT assume the feature is present.

### Multiscales Block

The root group MUST carry an OME-NGFF **0.4** `multiscales` array in its bare-root form (`attributes.multiscales`, not `attributes.ome.multiscales`). It is defined by OME-NGFF, not by this convention. Zarr Vectors relies on the following parts of it:

- `axes`: NGFF axis descriptors in NGFF order (`time → channel → custom → space`). `sid_ndim`, the number of spatial-index dimensions, is the count of axes with `type == "space"`. Units are UDUNITS-2 names; writers MUST NOT stamp placeholder units.
- `datasets[i]`: one entry per resolution level, with `path` equal to the level group's name (`"0"`, `"1"`, …).
- `datasets[i].coordinateTransformations`: the **only** place a level's bin geometry is stored. `scale = bin_shape / base_bin_shape` and `translation = bin_shape / 2`, so `bin_ratio = scale` and `bin_shape = 2 × translation` on read. Level 0 has `scale = 1` and `translation = base_bin_shape / 2`. `scale` is a float and MUST NOT be rounded.
- `metadata.format`: MUST be `"zarr_vectors"`. NGFF reserves the entry's `type` field for the downsampling method, so the discriminator lives here instead.

### Level Metadata Object

The `zarr_vectors_level` object on each resolution-level group. Readers SHOULD ignore keys they do not recognise.

| Field Name             | Type                 | Description |
| ---------------------- | -------------------- | ----------- |
| level                  | integer ≥ 0          | **REQUIRED**. Level index; `0` is full resolution and MUST be present. |
| vertex_count           | integer ≥ 0          | Total vertex rows across all `vertices` cells at this level. |
| arrays_present         | \[string]            | Canonical family names present at this level, such as `"vertex_attributes"` (never `"vertex_attributes/<name>"`). |
| fragments_tile         | boolean              | `true` when every chunk's fragment index tiles its vertex buffer exactly, so a bulk read may skip `vertex_fragments`. Any write to `vertices` or `vertex_fragments` clears it. Default `false`. |
| chunk_shape            | \[number] \| null    | Per-level chunk-shape override. Each axis MUST be a positive integer multiple of the root `chunk_shape` and an integer multiple of this level's `bin_shape`. |
| object_sparsity        | number in (0, 1]     | Fraction of the source level's objects kept at this level. |
| coarsening_method      | string               | `"per_object"`, `"manual"` or `"none"`. |
| parent_level           | integer \| null      | Source level index; `null` at level 0. |
| chunk_dims             | \[string] \| null    | Names of the chunk-key axes, leading axis first, when the store was rechunked along a non-spatial axis. |
| chunk_attribute_name   | string \| null       | Per-vertex attribute used as the leading chunk axis. |
| chunk_attribute_values | \[any] \| null       | Ordered map from leading-axis chunk coordinate to attribute value. |
| preserves_object_ids   | boolean              | `true` when this level inherits the parent's object-ID space. Default `false`. |
| inherited_num_objects  | integer \| null      | Size of the inherited object-ID space. **REQUIRED** when `preserves_object_ids` is `true`. |
| shared_fragments       | boolean              | `true` when fragments at this level may be referenced by several manifests. Default `false`. |

`bin_shape`, `bin_ratio` and `bounds` MUST NOT appear in this object. Bin geometry is stored once, in the NGFF transform; bounds are root-only. Keeping two copies of one value lets them drift apart silently.

### Array Metadata

Each Zarr Vectors array, and each family group (`links/<delta>`, `link_attributes/<name>/<delta>`, `object_index`), carries a `zv_array` discriminator and the fields listed for its kind at the root `attributes` level. A reader MUST reject a node whose `zv_array` value it does not recognise.

| `zv_array`              | Node                                               | Required fields | Optional fields | Format spec |
| ----------------------- | -------------------------------------------------- | --------------- | --------------- | ----------- |
| `vertices`              | `<level>/vertices` (array)                         | `dtype`, `encoding` (`"raw"` \| `"draco"`) | `shape`, `compression_codec` | [§7.1](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#71-vertex-positions) |
| `vertex_fragments`      | `<level>/vertex_fragments` (array)                 | `encoding` = `"fragment_index_v1"` | — | [§7.3](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#73-vertex-fragments) |
| `link_fragments`        | `<level>/link_fragments` (array)                   | `encoding` = `"fragment_index_v1"` | — | [§7.5](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#75-vertex-links) |
| `links_family`          | `<level>/links/<delta>` (group)                    | `level_delta`, `link_width`, `sid_ndim`, `directed`, `store` (`"canonical"` \| `"duplicate"`) | `num_links`, `num_physical_records` | [§10.6](https://alleninstitute.github.io/zarr_vectors/10-cross-chunk-linking.html#106-on-disk-layout-the-links-family) |
| `links`                 | `<level>/links/<delta>/<offsets>` (array)          | `dtype`, `offsets`, `has_perm`, `link_width`, `level_delta` | — | [§10.6](https://alleninstitute.github.io/zarr_vectors/10-cross-chunk-linking.html#106-on-disk-layout-the-links-family) |
| `attribute`             | `<level>/vertex_attributes/<name>` (array)         | `name`, `dtype`, `row_shape` | `channel_names`, `channel_dtype` | [§7.2](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#72-vertex-attributes) |
| `fragment_attribute`    | `<level>/fragment_attributes/<name>` (array)       | `name`, `dtype`, `row_shape` | `channel_names`, `channel_dtype` | [§7.9](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#79-fragment-attributes) |
| `link_attribute_family` | `<level>/link_attributes/<name>/<delta>` (group)   | `name`, `level_delta` | — | [§7.7](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#77-link-attributes) |
| `link_attribute`        | `<level>/link_attributes/<name>/<delta>/<offsets>` (array) | `name`, `dtype`, `row_shape`, `offsets`, `level_delta` | `channel_names` | [§7.7](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#77-link-attributes) |
| `object_index`          | `<level>/object_index` (group)                     | `num_objects`, `num_present`, `sid_ndim`, `layout` = `"vlen_manifests_v1"` | — | [§7.6](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#76-object-index) |
| `object_attribute`      | `<level>/object_attributes/<name>` (array)         | `name`, `dtype` | `shape`, `channel_names`, `fill_sentinel_meaning` = `"absent"` | [§7.8](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#78-object-attributes) |
| `groups`                | `<level>/groups` (array)                           | `num_groups` | `group_ranges` | [§7.4](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#74-groups) |
| `groupings_attribute`   | `<level>/group_attributes/<name>` (array)          | `name`, `dtype` | `shape`, `channel_names` | [§7.4](https://alleninstitute.github.io/zarr_vectors/07-core-arrays.html#74-groups) |

The discriminator for `group_attributes/<name>` is spelled `groupings_attribute`, and that spelling is normative.

Every **per-chunk** array (`vertices`, `vertex_fragments`, `link_fragments`, `links`, `attribute`, `fragment_attribute`, `link_attribute`) also carries:

| Field Name        | Type        | Description |
| ----------------- | ----------- | ----------- |
| nonempty_chunks   | \[string]   | Occupied cells as dot-separated chunk keys (`"0.0.1"`). It lets a reader enumerate chunks in O(1) without listing the store. Independent per-cell writers MUST NOT each update it; a coordinator derives it after the writes. |
| chunk_grid_origin | \[integer]  | Absolute chunk coordinate of cell `(0, …, 0)`, which is `floor(min_corner / chunk_shape)`. Present only when non-zero; when absent, chunk coordinates are array indices. |

### Additional Field Information

#### dtype

The array's Zarr `data_type` is `variable_length_bytes` for every per-chunk cell. The element type of the rows inside a cell is therefore declared here as a NumPy dtype string (`"float32"`, `"int64"`, …), and a reader MUST take it from this field.

#### row_shape

`[]` for a scalar attribute and `[C]` for a `C`-channel one. It is the authority on column count. `channel_names` are only labels: a reader falls back to `len(channel_names)` only when `row_shape` is absent.

#### offsets and has_perm

`offsets` lists the `link_width - 1` signed chunk offsets, relative to the source chunk, at which a record's other endpoints live; it is empty for `link_width = 1`. The array's path segment carries the same information. `has_perm` is true exactly when the offsets are non-zero, `level_delta == 0`, and either `store == "duplicate"` or `directed` is false. In that case each row carries one extra permutation column.

#### layout (object_index)

A reader MUST reject any `layout` other than `"vlen_manifests_v1"` rather than guess at it.

## Composability

- **OME-NGFF**: the root `multiscales` block is NGFF 0.4, so generic NGFF tools can list the levels and read the axis units. Once OME-NGFF registers itself as a Zarr Convention, writers SHOULD also list it in `zarr_conventions`.
- **Extending Zarr Vectors**: the Root, Level and Array metadata objects allow additional properties. Other conventions MAY add prefixed keys to them (for example a `proj:` CRS on the root object).

## Open Questions for This Draft

1. **Un-namespaced array keys.** Format 0.9 puts array fields (`dtype`, `shape`, `name`, `encoding`, `offsets`, …) directly in `attributes`, beside `zv_array`. The Zarr Conventions specification recommends a prefix or a single nesting key, and generic names such as `dtype` and `shape` could collide with other conventions. A later version could nest them as `"zv_array": {"kind": "vertices", "dtype": …}` or prefix them with `zv:`. This draft keeps 0.9's layout unchanged, because `zv_array` and `zv_version` are documented as frozen key names.
2. **Three keys, one convention.** The registered `name` is `zarr_vectors`, but level and array nodes use `zarr_vectors_level` and `zv_array`. This is allowed (a name is not an identifier), but it departs from the "name matches the nesting key" recommendation.
3. **Registration on every node.** 0.9.2 writers do not yet emit `zarr_conventions`. This draft asks for it on every node that carries Zarr Vectors properties. The alternative is registration on the root only, with descendants inheriting it, but the Zarr Conventions specification defines registration per node.
4. **Hosting.** The URLs point at `Andrew-Keenlyside/zarr-vectors` with tag `v0.9.2`. If the repository moves (for example to `zarr-conventions/` or `zarr-experimental/`), the `uuid` stays the same and only the URLs change.

## Known Implementations

This section helps potential implementers assess the convention's maturity and adoption, and provides a way for the community to collaborate on future revisions.

### Libraries and Tools

- **zarr-vectors-py**: reference reader, writer and validator (`zarr_vectors.validate`, conformance levels 1–5), with the authoritative LinkML schema at `schema/zarr_vectors.linkml.yaml`
  - Language: Python
  - Repository: https://github.com/AllenInstitute/zarr-vectors-py
  - Status: Experimental
  - Maintainer: @Andrew-Keenlyside, @fcollman
  - Since: format 0.9.2
- **zarr-vectors-tools**: converters to and from TRX and other formats
  - Language: Python
  - Repository: https://github.com/AllenInstitute/zarr-vectors-tools
  - Status: Experimental
  - Maintainer: @Andrew-Keenlyside

### Datasets Using This Convention

- _None published yet._

### Resources

- [Zarr Vectors format specification](https://alleninstitute.github.io/zarr_vectors/): the 15-chapter specification, with worked examples for point clouds, meshes, skeletons, streamlines and spatial transcriptomics (§14)
- [Mapping from the Neuroglancer precomputed annotation format](https://alleninstitute.github.io/zarr_vectors/15-appendices.html) (Appendix K)

_If you implement or use this convention, please add your implementation to this list by submitting a pull request._

## Acknowledgements

This template is based on the [STAC extensions template](https://github.com/stac-extensions/template/blob/main/README.md). The Zarr Vectors format draws on [TRX](https://github.com/tee-ar-ex/trx-spec), [OME-Zarr](https://ngff.openmicroscopy.org/) and the [Neuroglancer precomputed](https://github.com/google/neuroglancer/tree/master/src/datasource/precomputed) formats.
