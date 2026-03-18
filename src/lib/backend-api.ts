export const BACKEND_BASE_URL =
  import.meta.env.VITE_BACKEND_URL?.replace(/\/+$/, "") || "https://stock-snap-helper.onrender.com";

export interface BackendQuote {
  code: string;
  name: string;
  price: number;
  changePercent: number;
}

export interface BackendIndex {
  code: string;
  name: string;
  price: number;
  changePercent: number;
}

export interface BackendOcrHolding {
  name: string;
  code: string;
  weight: number;
}

export interface BackendOcrResult {
  text: string;
  holdings: BackendOcrHolding[];
}

export async function backendQuotes(codes: string[]): Promise<BackendQuote[]> {
  if (codes.length === 0) return [];
  const url = new URL(`${BACKEND_BASE_URL}/api/quotes`);
  url.searchParams.set("codes", codes.join(","));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function backendOcrHoldings(file: File): Promise<BackendOcrResult> {
  const url = `${BACKEND_BASE_URL}/api/ocr/holdings`;
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function backendIndices(): Promise<BackendIndex[]> {
  const url = `${BACKEND_BASE_URL}/api/indices`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

