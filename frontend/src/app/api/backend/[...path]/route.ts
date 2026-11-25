import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = (process.env.BACKEND_URL || "http://backend:8080").replace(/\/$/, "");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path ? path.join("/") : "";
  const search = req.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/${pathStr}${search}`;

  try {
    const headers = new Headers();
    const apiKey = req.headers.get("x-google-api-key");
    if (apiKey) {
      headers.set("x-google-api-key", apiKey);
    }

    const res = await fetch(targetUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { detail: `Failed to connect to backend: ${String(error)}` },
      { status: 502 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path ? path.join("/") : "";
  const targetUrl = `${BACKEND_URL}/${pathStr}`;

  try {
    const headers = new Headers();
    const apiKey = req.headers.get("x-google-api-key");
    if (apiKey) {
      headers.set("x-google-api-key", apiKey);
    }

    const contentType = req.headers.get("content-type") || "";
    let body: BodyInit;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      body = formData;
    } else {
      headers.set("Content-Type", "application/json");
      body = await req.text();
    }

    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { detail: `Failed to connect to backend: ${String(error)}` },
      { status: 502 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path ? path.join("/") : "";
  const targetUrl = `${BACKEND_URL}/${pathStr}`;

  try {
    const headers = new Headers();
    const apiKey = req.headers.get("x-google-api-key");
    if (apiKey) {
      headers.set("x-google-api-key", apiKey);
    }

    const res = await fetch(targetUrl, {
      method: "DELETE",
      headers,
      cache: "no-store",
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { detail: `Failed to connect to backend: ${String(error)}` },
      { status: 502 }
    );
  }
}
