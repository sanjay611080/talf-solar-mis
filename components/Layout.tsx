
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';

interface Props {
  children: React.ReactNode;
}

const Layout: React.FC<Props> = ({ children }) => {
  const { currentUser, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="min-h-screen bg-solar-bg font-sans text-solar-text">
      {/* Navbar */}
      <nav className="h-16 border-b border-solar-border bg-solar-card/80 backdrop-blur fixed w-full top-0 z-40">
        <div className="px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="text-gray-400 hover:text-white p-1 rounded transition"
              title="Toggle sidebar"
              aria-label="Toggle sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-tr from-yellow-400 to-orange-600 rounded-full"></div>
              <span className="text-xl font-bold text-white tracking-wide hidden sm:inline">Talf Solar <span className="font-light text-solar-accent">MIS</span></span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-white">{currentUser?.username}</p>
                <p className="text-xs text-gray-400 capitalize">{currentUser?.role}</p>
              </div>
              <button onClick={logout} className="text-gray-400 hover:text-red-400" title="Logout" aria-label="Logout">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      {/* Backdrop for mobile when sidebar is open */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed top-16 inset-x-0 bottom-0 bg-black/60 z-30"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Main content */}
      <div className={`pt-16 min-h-screen flex flex-col transition-[margin] duration-300 ${isSidebarOpen ? 'lg:ml-64' : ''}`}>
        <main className="flex-1">
          {children}
        </main>
        <footer className="py-6 border-t border-solar-border text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Talf Solar India. All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export default Layout;
