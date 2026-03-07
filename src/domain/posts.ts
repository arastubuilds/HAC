export type Post = {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
};

export type CreatePostInput = {
    title: string;
    content: string;
};

export type UpdatePostInput = {
    postId: string;
    original:  CreatePostInput;
};