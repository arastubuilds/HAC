export interface Post {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
    userId: string;
}

export interface CreatePostInput {
    title: string;
    content: string;
    userId: string;
}

export interface UpdatePostInput {
    postId: string;
    original: { title: string; content: string };
    requestingUserId: string;
}
