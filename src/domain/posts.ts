export type Post = {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
    userId: string;
};

export type CreatePostInput = {
    title: string;
    content: string;
    userId: string;
};

export type UpdatePostInput = {
    postId: string;
    original: { title: string; content: string };
    requestingUserId: string;
};
