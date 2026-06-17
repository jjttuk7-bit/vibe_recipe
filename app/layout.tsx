import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "바이브 레시피",
  description:
    "레시피를 코드처럼 빌드하고, 부엌에서 실행하고, 결과를 다음 빌드로 되먹이는 페어 쿠킹 IDE.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
