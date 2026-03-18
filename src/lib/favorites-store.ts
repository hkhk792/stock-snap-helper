import { supabase } from "@/integrations/supabase/client";

export interface Favorite {
  id: string;
  user_id: string;
  fund_code: string;
  fund_name: string;
  created_at: string;
}

/**
 * 获取用户的自选列表
 */
export async function getFavorites(userId: string): Promise<Favorite[]> {
  const { data, error } = await supabase
    .from("favorites")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  
  if (error) {
    console.error("获取自选列表失败:", error);
    return [];
  }
  return data || [];
}

/**
 * 添加自选
 */
export async function addFavorite(userId: string, fundCode: string, fundName: string): Promise<Favorite | null> {
  const { data, error } = await supabase
    .from("favorites")
    .insert({
      user_id: userId,
      fund_code: fundCode,
      fund_name: fundName,
    })
    .select()
    .single();
  
  if (error) {
    console.error("添加自选失败:", error);
    return null;
  }
  return data;
}

/**
 * 移除自选
 */
export async function removeFavorite(userId: string, fundCode: string): Promise<boolean> {
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("fund_code", fundCode);
  
  if (error) {
    console.error("移除自选失败:", error);
    return false;
  }
  return true;
}

/**
 * 检查基金是否已收藏
 */
export async function isFavorite(userId: string, fundCode: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("fund_code", fundCode)
    .single();
  
  if (error) {
    return false;
  }
  return !!data;
}
