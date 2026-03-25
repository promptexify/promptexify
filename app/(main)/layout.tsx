import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { Container } from "@/components/ui/container";
import { getParentCategories } from "@/lib/content";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const parentCategories = await getParentCategories();
  return (
    <Container className="py-0">
      <div className="relative flex min-h-screen flex-col">
        <Header parentCategories={parentCategories} />
        <main className="flex-1">{children}</main>
        <Footer parentCategories={parentCategories} />
      </div>
    </Container>
  );
}
