import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class PinataService {
  private readonly logger = new Logger(PinataService.name);

  private gatewayBase(): string {
    return (
      process.env.PINATA_GATEWAY_URL?.replace(/\/$/, '') ||
      'https://gateway.pinata.cloud/ipfs'
    );
  }

  /**
   * Uploads an image to Pinata. Prefer PINATA_JWT (V3 API); otherwise
   * PINATA_API_KEY + PINATA_API_SECRET (legacy pinFileToIPFS).
   */
  async uploadImage(
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string> {
    const jwt = process.env.PINATA_JWT?.trim();
    if (jwt) {
      return this.uploadV3(jwt, buffer, filename, mimeType);
    }
    const key = process.env.PINATA_API_KEY?.trim();
    const secret = process.env.PINATA_API_SECRET?.trim();
    if (key && secret) {
      return this.uploadLegacy(key, secret, buffer, filename, mimeType);
    }
    throw new BadRequestException(
      'Image uploads are not configured. Set PINATA_JWT or PINATA_API_KEY and PINATA_API_SECRET.',
    );
  }

  private async uploadV3(
    jwt: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string> {
    const network =
      process.env.PINATA_NETWORK?.trim() === 'private' ? 'private' : 'public';

    const formData = new FormData();
    formData.append('network', network);
    formData.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename,
    );

    const res = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: formData,
    });

    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Pinata V3 upload failed: ${text}`);
      throw new BadRequestException('Could not upload image to storage');
    }

    let cid: string | undefined;
    try {
      const json = JSON.parse(text) as { data?: { cid?: string } };
      cid = json.data?.cid;
    } catch {
      this.logger.warn(`Pinata V3 parse error: ${text}`);
    }
    if (!cid) {
      throw new BadRequestException('Could not upload image to storage');
    }
    return `${this.gatewayBase()}/${cid}`;
  }

  private async uploadLegacy(
    key: string,
    secret: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string> {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename,
    );

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        pinata_api_key: key,
        pinata_secret_api_key: secret,
      },
      body: formData,
    });

    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Pinata legacy upload failed: ${text}`);
      throw new BadRequestException('Could not upload image to storage');
    }

    let hash: string | undefined;
    try {
      const json = JSON.parse(text) as { IpfsHash?: string };
      hash = json.IpfsHash;
    } catch {
      this.logger.warn(`Pinata legacy parse error: ${text}`);
    }
    if (!hash) {
      throw new BadRequestException('Could not upload image to storage');
    }
    return `${this.gatewayBase()}/${hash}`;
  }
}
