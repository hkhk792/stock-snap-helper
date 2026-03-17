import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Portfolio = Tables<"portfolios">;
export type PortfolioHolding = Tables<"portfolio_holdings">;

export async function listPortfolios() {
  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createPortfolio(input: { user_id: string; name: string; base_nav?: number }) {
  const payload: TablesInsert<"portfolios"> = {
    user_id: input.user_id,
    name: input.name,
    base_nav: input.base_nav ?? 1,
  };
  const { data, error } = await supabase.from("portfolios").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function renamePortfolio(id: string, name: string) {
  const { data, error } = await supabase
    .from("portfolios")
    .update({ name })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deletePortfolio(id: string) {
  const { error } = await supabase.from("portfolios").delete().eq("id", id);
  if (error) throw error;
}

export async function getPortfolio(id: string) {
  const { data, error } = await supabase.from("portfolios").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function listHoldings(portfolioId: string) {
  const { data, error } = await supabase
    .from("portfolio_holdings")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function replaceHoldings(
  portfolioId: string,
  holdings: Array<
    Pick<
      PortfolioHolding,
      "id" | "name" | "code" | "weight" | "alias" | "buy_amount" | "buy_price" | "shares" | "sector"
    >
  >,
) {
  // Simple strategy: delete all then insert current list (safe & predictable for MVP).
  const { error: delErr } = await supabase.from("portfolio_holdings").delete().eq("portfolio_id", portfolioId);
  if (delErr) throw delErr;

  if (holdings.length === 0) return;

  const rows: TablesInsert<"portfolio_holdings">[] = holdings.map((h) => ({
    id: h.id,
    portfolio_id: portfolioId,
    name: h.name ?? "",
    code: h.code ?? "",
    weight: Number(h.weight ?? 0),
    alias: h.alias ?? "",
    buy_amount: Number(h.buy_amount ?? 0),
    buy_price: Number(h.buy_price ?? 0),
    shares: Number(h.shares ?? 0),
    sector: h.sector ?? "",
  }));

  const { error: insErr } = await supabase.from("portfolio_holdings").insert(rows);
  if (insErr) throw insErr;
}

export async function logOcrImport(input: {
  user_id: string;
  portfolio_id?: string | null;
  filename?: string;
  parsed_json: unknown;
}) {
  const { error } = await supabase.from("ocr_imports").insert({
    user_id: input.user_id,
    portfolio_id: input.portfolio_id ?? null,
    filename: input.filename ?? "",
    parsed_json: input.parsed_json as any,
  });
  if (error) throw error;
}

