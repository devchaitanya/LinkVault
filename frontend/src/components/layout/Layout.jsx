import Header from './Header.jsx';
import Footer from './Footer.jsx';

/**
 * Layout — wraps all pages with consistent header/footer.
 */
export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-start py-8 px-4">
        {children}
      </main>
      <Footer />
    </div>
  );
}
