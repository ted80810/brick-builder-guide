import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-foreground text-background py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center shadow-brick">
              <span className="text-primary-foreground font-heading font-bold text-sm">B</span>
            </div>
            <span className="font-heading font-bold text-xl">BrickBooks</span>
          </Link>

          <div className="flex items-center gap-6 text-sm opacity-70">
            <Link to="/" className="hover:opacity-100 transition-opacity">Home</Link>
            <Link to="/create" className="hover:opacity-100 transition-opacity">Create</Link>
            <Link to="/gallery" className="hover:opacity-100 transition-opacity">Gallery</Link>
          </div>

          <p className="text-sm opacity-50">© 2026 BrickBooks. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
