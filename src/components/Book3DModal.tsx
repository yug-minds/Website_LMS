'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './ui/dialog';
import { X } from 'lucide-react';
import Book3D from './Book3D';
import { Book } from '../data/books';

interface Book3DModalProps {
  book: Book;
  trigger: React.ReactNode;
}

export default function Book3DModal({ book, trigger }: Book3DModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div onClick={() => setIsOpen(true)} className="cursor-pointer w-full h-full">
        {trigger}
      </div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-transparent p-0 border-0 shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">{book.title}</DialogTitle>
          <button
            onClick={() => setIsOpen(false)}
            className="fixed right-6 top-6 z-[100] rounded-full opacity-100 hover:opacity-90 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 bg-white p-3 shadow-2xl border-2 border-red-500 hover:bg-red-50 hover:scale-110"
            aria-label="Close book"
            type="button"
          >
            <X className="h-7 w-7 text-red-500 font-bold" strokeWidth={3} />
          </button>
          <div className="flex items-center justify-center bg-transparent p-8 min-h-[600px]">
            <Book3D 
              book={book} 
              className="!py-4"
              width={500}
              height={750}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

