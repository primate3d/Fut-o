import { NextResponse } from "next/server";
import { findAlternativeOffers } from "@/features/recommendations/service";
import type { Expense } from "@/types";

export async function POST(request: Request) {
  const body = (await request.json()) as { expenses?: Expense[] };
  const expenses = Array.isArray(body.expenses) ? body.expenses : [];

  return NextResponse.json({
    alternatives: findAlternativeOffers(expenses)
  });
}
