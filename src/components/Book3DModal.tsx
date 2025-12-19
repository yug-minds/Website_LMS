'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
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
          <button
            onClick={() => setIsOpen(false)}
            className="absolute right-4 top-4 z-[100] rounded-full opacity-100 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 bg-white p-2.5 shadow-xl border-2 border-red-500 hover:bg-red-50"
            aria-label="Close"
          >
            <X className="h-6 w-6 text-red-500 font-bold" strokeWidth={3} />
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

