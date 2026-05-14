import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const pngSignature = '89504e470d0a1a0a';

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let c = 0xffffffff;

  for (let index = 0; index < buffer.length; index += 1) {
    c = crcTable[(c ^ buffer[index]) & 0xff] ^ (c >>> 8);
  }

  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);

  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);

  return output;
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpperLeft = Math.abs(estimate - upperLeft);

  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpperLeft) {
    return left;
  }

  if (distanceUp <= distanceUpperLeft) {
    return up;
  }

  return upperLeft;
}

function parsePng(inputPath) {
  const buffer = fs.readFileSync(inputPath);

  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`Not a PNG: ${inputPath}`);
  }

  let offset = 8;
  let header = null;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;

    const type = buffer.subarray(offset, offset + 4).toString('ascii');
    offset += 4;

    const data = buffer.subarray(offset, offset + length);
    offset += length + 4;

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!header) {
    throw new Error('Missing PNG IHDR chunk');
  }

  if (header.bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth: ${header.bitDepth}`);
  }

  if (![2, 6].includes(header.colorType)) {
    throw new Error(`Unsupported PNG color type: ${header.colorType}`);
  }

  if (header.interlace !== 0) {
    throw new Error('Interlaced PNGs are not supported');
  }

  const channels = header.colorType === 6 ? 4 : 3;
  const stride = header.width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(header.width * header.height * 4);
  const previousRow = Buffer.alloc(stride);
  const currentRow = Buffer.alloc(stride);
  let readOffset = 0;

  for (let y = 0; y < header.height; y += 1) {
    const filter = inflated[readOffset];
    readOffset += 1;

    inflated.copy(currentRow, 0, readOffset, readOffset + stride);
    readOffset += stride;

    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? currentRow[index - channels] : 0;
      const up = previousRow[index];
      const upperLeft = index >= channels ? previousRow[index - channels] : 0;

      if (filter === 1) {
        currentRow[index] = (currentRow[index] + left) & 255;
      } else if (filter === 2) {
        currentRow[index] = (currentRow[index] + up) & 255;
      } else if (filter === 3) {
        currentRow[index] = (currentRow[index] + Math.floor((left + up) / 2)) & 255;
      } else if (filter === 4) {
        currentRow[index] = (currentRow[index] + paethPredictor(left, up, upperLeft)) & 255;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }
    }

    for (let x = 0; x < header.width; x += 1) {
      const sourceIndex = x * channels;
      const targetIndex = (y * header.width + x) * 4;

      rgba[targetIndex] = currentRow[sourceIndex];
      rgba[targetIndex + 1] = currentRow[sourceIndex + 1];
      rgba[targetIndex + 2] = currentRow[sourceIndex + 2];
      rgba[targetIndex + 3] = channels === 4 ? currentRow[sourceIndex + 3] : 255;
    }

    currentRow.copy(previousRow);
  }

  return {
    width: header.width,
    height: header.height,
    rgba,
  };
}

function writePng(outputPath, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let writeOffset = 0;

  for (let y = 0; y < height; y += 1) {
    raw[writeOffset] = 0;
    writeOffset += 1;
    rgba.copy(raw, writeOffset, y * width * 4, (y + 1) * width * 4);
    writeOffset += width * 4;
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const output = Buffer.concat([
    Buffer.from(pngSignature, 'hex'),
    createChunk('IHDR', header),
    createChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    createChunk('IEND'),
  ]);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
}

function distanceToKey(red, green, blue, key) {
  return Math.hypot(red - key[0], green - key[1], blue - key[2]);
}

function sampleBorderKey({ width, height, rgba }) {
  const colors = [];
  const border = Math.max(3, Math.round(Math.min(width, height) * 0.015));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x >= border &&
        y >= border &&
        x < width - border &&
        y < height - border
      ) {
        continue;
      }

      const index = (y * width + x) * 4;
      colors.push([rgba[index], rgba[index + 1], rgba[index + 2]]);
    }
  }

  return [0, 1, 2].map((channel) => {
    const values = colors
      .map((color) => color[channel])
      .sort((left, right) => left - right);

    return values[Math.floor(values.length / 2)];
  });
}

function removeChromaKey({
  input,
  output,
  key,
  autoKey,
  transparentThreshold,
  opaqueThreshold,
  despill,
}) {
  const parsed = parsePng(input);
  const { width, height, rgba } = parsed;
  const resolvedKey = autoKey === 'border' ? sampleBorderKey(parsed) : key;
  let transparentPixels = 0;

  for (let index = 0; index < rgba.length; index += 4) {
    const red = rgba[index];
    const green = rgba[index + 1];
    const blue = rgba[index + 2];
    const distance = distanceToKey(red, green, blue, resolvedKey);
    let alpha = 255;

    if (distance <= transparentThreshold) {
      alpha = 0;
    } else if (distance < opaqueThreshold) {
      alpha = Math.round(
        ((distance - transparentThreshold) /
          (opaqueThreshold - transparentThreshold)) *
          255,
      );
    }

    if (alpha < rgba[index + 3]) {
      rgba[index + 3] = alpha;
    }

    if (rgba[index + 3] === 0) {
      transparentPixels += 1;
    }

    if (
      despill &&
      resolvedKey[1] > resolvedKey[0] &&
      resolvedKey[1] > resolvedKey[2] &&
      rgba[index + 3] > 0 &&
      distance < opaqueThreshold + 80
    ) {
      const strongestNonKeyChannel = Math.max(red, blue);

      if (green > strongestNonKeyChannel) {
        rgba[index + 1] = Math.round(
          strongestNonKeyChannel + (green - strongestNonKeyChannel) * 0.25,
        );
      }
    }
  }

  writePng(output, width, height, rgba);

  return {
    output,
    key: resolvedKey,
    width,
    height,
    transparentPixels,
    totalPixels: width * height,
  };
}

function parseKey(value) {
  const channels = value.split(',').map((channel) => Number(channel.trim()));

  if (
    channels.length !== 3 ||
    channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)
  ) {
    throw new Error('--key must be three comma-separated integers, for example 0,255,0');
  }

  return channels;
}

function readArgs(argv) {
  const options = {
    key: [0, 255, 0],
    autoKey: null,
    transparentThreshold: 35,
    opaqueThreshold: 170,
    despill: true,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--input') {
      options.input = next;
      index += 1;
    } else if (arg === '--output') {
      options.output = next;
      index += 1;
    } else if (arg === '--key') {
      options.key = parseKey(next);
      index += 1;
    } else if (arg === '--auto-key') {
      options.autoKey = next;
      index += 1;
    } else if (arg === '--transparent-threshold') {
      options.transparentThreshold = Number(next);
      index += 1;
    } else if (arg === '--opaque-threshold') {
      options.opaqueThreshold = Number(next);
      index += 1;
    } else if (arg === '--no-despill') {
      options.despill = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.input || !options.output) {
    throw new Error('Usage: node scripts/chroma-key-to-alpha.mjs --input <png> --output <png> [--key 0,255,0]');
  }

  return options;
}

const result = removeChromaKey(readArgs(process.argv));
console.log(JSON.stringify(result, null, 2));
