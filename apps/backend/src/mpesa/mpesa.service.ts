import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * M-Pesa Daraja API service (Safaricom).
 *
 * Currently a stub implementation — it logs requests and simulates responses.
 * To go live:
 *   1. Set MPESA_* env vars from your Daraja app credentials.
 *   2. Replace getAccessToken() with a real call to oauth/v1/generate.
 *   3. Replace stkPush() with a real call to mpesa/stkpush/v1/processrequest.
 *   4. Set MPESA_CALLBACK_URL to your deployed domain + /mpesa/callback.
 */
@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  constructor(private readonly config: ConfigService) {}

  private get isSandbox() {
    return this.config.get('MPESA_ENV', 'sandbox') === 'sandbox';
  }

  private get baseUrl() {
    return this.isSandbox
      ? 'https://sandbox.safaricom.co.ke'
      : 'https://api.safaricom.co.ke';
  }

  /** Obtain OAuth token from Daraja */
  async getAccessToken(): Promise<string> {
    const key = this.config.get<string>('MPESA_CONSUMER_KEY');
    const secret = this.config.get<string>('MPESA_CONSUMER_SECRET');

    if (!key || !secret) {
      this.logger.warn('M-Pesa credentials not configured — returning stub token');
      return 'stub_token';
    }

    const credentials = Buffer.from(`${key}:${secret}`).toString('base64');
    const url = `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;

    const response = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    const data: any = await response.json();
    return data.access_token;
  }

  /**
   * Initiate STK Push (Lipa Na M-Pesa Online).
   * Returns the CheckoutRequestID used to track payment status.
   */
  async stkPush(params: {
    phone: string;     // format: 254XXXXXXXXX
    amount: number;
    reference: string; // transaction reference
    description: string;
  }) {
    const shortcode = this.config.get<string>('MPESA_SHORTCODE', '174379');
    const passkey = this.config.get<string>('MPESA_PASSKEY');
    const callbackUrl = this.config.get<string>('MPESA_CALLBACK_URL', 'https://example.com/mpesa/callback');

    if (!passkey) {
      this.logger.warn(`STK Push STUB — would send KES ${params.amount} to ${params.phone}`);
      return {
        stub: true,
        CheckoutRequestID: `STUB-${Date.now()}`,
        ResponseCode: '0',
        ResponseDescription: 'Success (stub)',
      };
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const token = await this.getAccessToken();

    const body = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(params.amount),
      PartyA: params.phone,
      PartyB: shortcode,
      PhoneNumber: params.phone,
      CallBackURL: callbackUrl,
      AccountReference: params.reference,
      TransactionDesc: params.description,
    };

    const url = `${this.baseUrl}/mpesa/stkpush/v1/processrequest`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return response.json();
  }

  /** Parse incoming Safaricom callback and extract result */
  parseCallback(payload: any): { reference: string; success: boolean; amount: number } {
    const body = payload?.Body?.stkCallback;
    const success = body?.ResultCode === 0;
    const items: any[] = body?.CallbackMetadata?.Item ?? [];

    const get = (name: string) => items.find((i: any) => i.Name === name)?.Value;

    return {
      reference: get('AccountReference') ?? '',
      success,
      amount: get('Amount') ?? 0,
    };
  }
}
