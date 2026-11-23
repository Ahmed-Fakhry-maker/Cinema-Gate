export interface User {
  id: number;
  name: string;
  email: string;
}

export interface GenreOption {
  id: number;
  name: string;
}

export interface FilmSummary {
  id: number;
  tmdbId: number;
  slug: string;
  title: string;
  releaseYear: number;
  genre: string;
  genres: string[];
  director: string;
  runtimeMinutes: number;
  country: string;
  plotBrief: string;
  posterUrl: string;
  backdropUrl: string | null;
  tagline: string | null;
  tmdbRating: number | null;
  tmdbVoteCount: number;
  averageRating: number | null;
  reviewCount: number;
  inWatchlist: boolean;
}

export interface ReviewItem {
  id: number;
  filmId: number;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: number;
    name: string;
  };
  isOwner: boolean;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
}

export interface FilmDetail extends FilmSummary {
  cast: CastMember[];
  reviews: ReviewItem[];
  userReview: ReviewItem | null;
}

export interface WatchlistEntry extends FilmSummary {
  addedAt: string;
}
