import { createFileRoute } from "@tanstack/react-router";
import { MovementSurface } from "@/components/MovementSurface";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "orbit — المشي والرؤية" },
      { name: "description", content: "تجربة حركة ثنائية الأبعاد ورؤية ناعمة للتواصل على orbit." },
      { property: "og:title", content: "orbit — المشي والرؤية" },
      { property: "og:description", content: "مساحة تجربة المشي والرؤية في orbit على الهاتف والمتصفح." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MovementSurface,
});
