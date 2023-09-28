"use server"

import { revalidatePath } from "next/cache";
import Thread from "../models/thread.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";

interface Params{
    text: string,
    author: string,
    communityId: string | null,
    path: string,
}

export async function createThread({text, author, communityId, path}:Params) {
    
    try{
        connectToDB();

        const createThread = await Thread.create({
            text,
            author,
            community: null,
    
        });
    
        // Update user model
        await User.findByIdAndUpdate(author, {
            $push: { threads: createThread._id}
        })
    
        revalidatePath(path); //acts as refresh
    } catch(error: any){
        throw new Error(`Error creating thread: ${error.message}`)
    }
    
}

export async function fetchPosts(pageNumber = 1, pageSize = 20){
    connectToDB();

    // Calc the number of posts to skip
    const skipAmount = (pageNumber - 1 ) * pageSize;

    // Fetch posts that have no parents (top-level)
    const postQuery = Thread.find({ parentId: {$in: [null, undefined]}})
        .sort({ createdAt: 'desc' })
        .skip(skipAmount)
        .limit(pageSize)
        .populate({path: 'author', model: User })
        .populate({
            path: 'children',
            populate: {
                path: 'author',
                model: User,
                select: "_id name parentId image"
            }
        })

    const totalPostCount = await Thread.countDocuments({parentId: {$in: [null, undefined]}}) 

    const posts = await postQuery.exec();

    const isNext = totalPostCount > skipAmount + posts.length;

    return { posts, isNext };
}

export async function fetchPostById(id:string){
    connectToDB();

    try {
        const thread = await Thread.findById(id)
            .populate({
                path: 'author',
                model: User,
                select: "_id id name image",
            })
            .populate({
                path: 'children',
                populate: [{
                    path: 'author',
                    model: User,
                    select: "_id id name parentId image",
                },{
                    path: 'children',
                    model: Thread,
                    populate: {
                        path: 'author',
                        model: User,
                        select: "_id id name parentId image",
                    }
                }]
            }).exec();

            return thread;
    } catch (error: any) {
        throw new Error(`Failed to fetch the thread ${error.message}`);
    }
}

export async function addComment(threadId: string, commentText: string, userId: string, path: string){
    connectToDB();
    try {
        // Finding the original thread to comment on
        const originalThread = await Thread.findById(threadId);
        if(!originalThread){
            throw new Error("Thread doesn't exist!");
        }

        // Creating the comment
        const commentToThread = new Thread({
            text: commentText,
            author: userId,
            parentId: threadId,
        });

        // Saving the comment to the database
        const saveCommentThread = await commentToThread.save();

        // Update original thread to have the comment under it
        originalThread.children.push(saveCommentThread._id);

        // Save the original thread
        await originalThread.save();

        revalidatePath(path);
        
    } catch(err: any){
        throw new Error(`Failed to comment to the thread ${err.message}`);
    }
}