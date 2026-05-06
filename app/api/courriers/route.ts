import { NextResponse } from "next/server";
import { generateLettersFromAnalysis } from "@/features/letters/service";
import type { MockAnalysis } from "@/types";

export async function POST(request: Request) {
  const body = (await request.json()) as { analysis?: MockAnalysis };

  if (!body.analysis) {
    return NextResponse.json({ letters: [] });
  }

  return NextResponse.json({
    letters: generateLettersFromAnalysis(body.analysis)
  });
}
