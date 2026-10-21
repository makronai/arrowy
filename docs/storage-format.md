# Storage Format Specification: Array v1 (.arr)

## 1. Overview
The `.arr` v1 container format is a byte-bounded, checksum-verified storage object designed specifically for versioned file-backed database platforms. It combines binary header metadata with newline-delimited JSON (JSON Lines) record payloads.

## 2. Binary Layout

```text
+-----------------------+----------------------+-----------------------+
|  Bytes 0 - 7          |  Bytes 8 - 11        |  Bytes 12 - 15        |
|  Magic Signature      |  Format Version      |  Header Length (N)    |
|  (8 bytes)            |  (uint32 BE = 1)     |  (uint32 BE)          |
+-----------------------+----------------------+-----------------------+
|  Bytes 16 to (16 + N - 1)                                            |
|  Header JSON Payload (UTF-8 encoded JSON string)                     |
+----------------------------------------------------------------------+
|  Bytes (16 + N) to EOF                                               |
|  Records Payload (UTF-8 JSON Lines, each terminated by '\n')         |
+----------------------------------------------------------------------+
```

### 2.1 Magic Signature
- Hex: `41 52 52 31 00 00 00 00`
- ASCII representation: `ARR1\0\0\0\0`
- Any file lacking this signature is rejected immediately with `CorruptedDataError`.

### 2.2 Version Field
- Offset: 8
- Length: 4 bytes
- Format: Unsigned 32-bit integer, Big-Endian (`readUInt32BE`)
- Current specification value: `1`

### 2.3 Header Length Field
- Offset: 12
- Length: 4 bytes
- Format: Unsigned 32-bit integer, Big-Endian (`readUInt32BE`)
- Indicates the byte length $N$ of the succeeding JSON header string.

### 2.4 Header JSON Schema
```json
{
  "format": "ARR1",
  "version": 1,
  "recordCount": 500,
  "payloadEncoding": "jsonl",
  "payloadBytes": 512000,
  "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "createdAt": "2026-10-21T10:00:00.000Z",
  "chunkId": "chunk_000001"
}
```

### 2.5 Records Payload
- UTF-8 encoded lines.
- Each line is a standalone, RFC 8259 compliant JSON string followed by `\n`.
- Records are never split across chunk files.
- Empty lines are ignored.

## 3. Directory Layout in Storage Provider

```text
repository-root/
└── .array/
    ├── registries.json
    ├── relational_dbs/
    │   └── <database_name>/
    │       └── <table_name>/
    │           ├── schema.json
    │           ├── metadata.json
    │           └── chunks/
    │               ├── data_000001.arr
    │               └── data_000002.arr
    └── nosql_dbs/
        └── <database_name>/
            └── <collection_name>/
                ├── metadata.json
                └── chunks/
                    └── data_000001.arr
```
