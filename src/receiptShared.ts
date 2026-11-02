import { escapeHtml } from './html';

export const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const receiptPolicy = (
  text: string,
  depositAmount: string | undefined,
  isBlank: boolean,
) =>
  escapeHtml(
    text.replaceAll(
      '{deposit}',
      !isBlank && depositAmount ? money(Number(depositAmount)) : '________',
    ),
  );

export const isDigitalSignature = (signature: string | undefined) =>
  Boolean(signature) &&
  /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(signature!);
