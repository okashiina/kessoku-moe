import Link from 'next/link';

export interface GenreProps {
  genre: string;
}

const Genre: React.FC<GenreProps> = ({ genre }) => {
  return (
    <Link href={`/genre/${genre}`} passHref>
      <a className="inline-flex min-h-[44px] items-center rounded-[5px] border border-[#5a495f] px-3.5 py-2 text-sm font-bold text-[#c9bdc8] transition duration-200 [touch-action:manipulation] hover:text-[#f4ecef]">
        {genre}
      </a>
    </Link>
  );
};

export default Genre;
