const express = require("express");
const User = require("../models/blog.js");
const sortUsers = require("../utils/sorts.js");
const router = express.Router();
require("dotenv").config();
const jwt = require("jsonwebtoken");

// user verification middleware
const SECRET_KEY = process.env.SECRET_KEY;
const verifyToken = (req, res, next) => {
  if (req.headers && req.headers.authorization) {
    const token = req.headers.authorization.split(" ")[1];
    if (!token) return res.sendStatus(403);
    jwt.verify(token, SECRET_KEY, (err, authData) => {
      try {
        if (err) return res.status(403).json({ err: err });

        // confirm if user exists
        const user = User.findById(authData.id);
        if (!user) return res.sendStatus(403);

        req.id = authData.id;
        req.userName = authData.userName;
        req.email = authData.email;
        next();
      } catch (error) {
        return res.status(500).json({ err: error.message });
      }
    });
  } else {
    return res.sendStatus(403);
  }
};

// TODO:low priority,add username option
// login with [email,password]
router.post("/user/login/", async (req, res) => {
  try {
    if (!req.body.email)
      return res.status(403).json({ error: "email is required" });
    if (!req.body.password)
      return res.status(403).json({ error: "password is required" });

    const user = await User.findOne({ email: req.body.email });

    // check if user exists with provided credentials
    if (!user) return res.status(403).json({ userError: "user not found" });

    // checks if password is correct
    if (user.password !== req.body.password)
      return res.status(403).json({ passwordError: "incorrect password" });

    // generate token
    const user_ = {
      id: user._id,
      userName: user.userName,
      email: user.email,
    };
    const token = jwt.sign(user_, SECRET_KEY, { expiresIn: "12h" });
    // const refreshToken = jwt.sign(user_, process.env.SECRET_KEY,{expiresIn:"30s"});
    res.status(200).json({ token });
  } catch (err) {
    return res.status(500).json({ "ERROR😬": `${err.message}` });
  }
});

// TODO: create a new token when a user is created +error handling when required values are
// TODO: checking whether input username exists as separate maybe
// creates a new user
router.post("user/new", async (req, res) => {
  const newUser = new User(req.body);
  try {
    await newUser.save();
    res.status(201).json(newUser);
  } catch (err) {
    res.status(400).json(err.message);
  }
});

// TODO: add sort functionality to search results

// search for a user in users with pagination
router.get("/searchUsers/", async (req, res) => {
  try {
    const validateNum = /^[1-9]\d*$/;
    const validPage = req.query.page ? validateNum.test(req.query.page) : false;
    const validPerPage = req.query.perPage
      ? validateNum.test(req.query.perPage)
      : false;
    const page = validPage ? +req.query.page : 1;
    const perPage = validPerPage ? +req.query.perPage : 10;
    const skip = (page - 1) * perPage;
    const matched = await User.find(
      {
        userName: { $regex: new RegExp(req.query.username, "i") },
      },
      {
        _id: 1,
        userName: 1,
        followersCount: { $size: "$followers" },
        blogsCount: { $size: "$blogs" },
      }
    )
      .skip(skip)
      .limit(perPage);

    const totalCount = await User.countDocuments({
      userName: { $regex: new RegExp(req.query.username, "i") },
    });

    res.status(200).json({ totalCount, matched: matched });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while searching for users" });
  }
});

// by userName
router.get("/getByUserName/:userName", async (req, res) => {
  try {
    const user = await User.findOne({ userName: req.params.userName });
    if (!user) return res.status(404).json({ UserError: "😬 user not found" });
    res.status(200).json(user);
  } catch (err) {
    res.status(400).json({ "ERROR😬": `${err.message}` });
  }
});

//  deprecated: by email
router.get("/getByEmail/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ message: "😬 user not found" });
    res.status(200).json(user);
  } catch (err) {
    res.status(400).json({ "ERROR😬": `${err.message}` });
  }
});

// protected user routes
router
  .route("/user")
  // get user by id
  .get(verifyToken, async (req, res) => {
    const toPopulate = [];
    try {
      // what to populate
      if (req.query.interests) toPopulate.push("interests");
      if (req.query.following) toPopulate.push("following");
      if (req.query.bookmarks) toPopulate.push("bookmarks");
      if (req.query.friends) toPopulate.push("friends");
      if (req.query.liked) toPopulate.push("liked");
      if (req.query.followers) toPopulate.push("followers");
      if (req.query.blogs) toPopulate.push("blogs");

      const user = toPopulate.length
        ? await User.findById(req.id).populate(toPopulate)
        : await User.findById(req.id);

      res.status(200).json(user);
    } catch (err) {
      res.status(400).json({ "ERROR😬": `${err.message}` });
    }
  })
  // Delete a user
  .delete(verifyToken, async (req, res) => {
    try {
      const user = await User.findByIdAndDelete(req.id);
      res.json(user);
    } catch (err) {
      res.status(500).json({ "ERROR😬": `${err.message}` });
    }
  })
  //update a user
  .put(verifyToken, async (req, res) => {
    try {
      const update = { ...req.body };
      const user_ = await User.findById(req.id);
      // updating (adding) those that are arrays
      if (update.friends) {
        if (!Array.isArray(update.friends))
          return res.status(400).json({ ValueError: "should be an array" });
        update.friends = update.friends.filter(
          (friend) => !user_.friends.includes(friend) && !user_._id == friend
        );
        update.$push = { friends: { $each: update.friends } };
        delete update.friends;
      }
      if (update.interests) {
        if (!Array.isArray(update.interests))
          return res.status(400).json({ ValueError: "should be an array" });

        update.interests = update.interests.filter(
          (interest) => !user_.interests.includes(interest)
        );
        update.$push = { ...{ interests: { $each: update.interests } } };
        delete update.interests;
      }
      if (update.following) {
        if (!Array.isArray(update.following))
          return res.status(400).json({ ValueError: "should be an array" });
        update.following = update.following.filter(
          (followed) =>
            !user_.following.includes(followed) && !user_._id == followed
        );
        update.$push = { ...{ following: { $each: update.following } } };
        delete update.following;
      }
      if (update.bookmarks) {
        if (!Array.isArray(update.bookmarks))
          return res.status(400).json({ ValueError: "should be an array" });
        update.bookmarks = update.bookmarks.filter(
          (bookmark) => !user_.bookmarks.includes(bookmark)
        );
        update.$push = { ...{ bookmarks: { $each: update.bookmarks } } };
        delete update.bookmarks;
      }
      if (update.followers) {
        if (!Array.isArray(update.followers))
          return res.status(400).json({ ValueError: "should be an array" });
        update.followers = update.followers.filter(
          (follower) =>
            !user_.followers.includes(follower) && !user_._id == follower
        );
        update.$push = { ...{ followers: { $each: update.followers } } };
        delete update.followers;
      }
      if (update.blogs) {
        if (!Array.isArray(update.blogs))
          return res.status(400).json({ ValueError: "should be an array" });
        update.blogs = update.blogs.filter(
          (blog) => !user_.blogs.includes(blog)
        );
        update.$push = { ...{ blogs: { $each: update.blogs } } };
        delete update.blogs;
      }
      if (update.liked) {
        if (!Array.isArray(update.liked))
          return res.status(400).json({ ValueError: "should be an array" });
        update.liked = update.liked.filter(
          (blog) => !user_.liked.includes(blog)
        );
        update.$push = { ...{ liked: { $each: update.liked } } };
        delete update.liked;
      }

      //updating (removing) those that are arrays
      if (update.remove_friends) {
        if (!Array.isArray(update.remove_friends))
          return res.status(400).json({ ValueError: "should be an array" });
        update.$pullAll = { friends: update.remove_friends };
        delete update.remove_friends;
      }
      if (update.remove_interests) {
        if (!Array.isArray(update.remove_interests))
          return res.status(400).json({ ValueError: "should be an array" });
        update.$pullAll = { ...{ interests: update.remove_interests } };
        delete update.remove_interests;
      }
      if (update.remove_following) {
        if (!Array.isArray(update.remove_following))
          return res.status(400).json({ ValueError: "should be an array" });
        update.$pullAll = { ...{ following: update.remove_following } };
        delete update.remove_following;
      }
      if (update.remove_bookmarks) {
        if (!Array.isArray(update.remove_bookmarks))
          return res.status(400).json({ ValueError: "should be an array" });
        update.$pullAll = { ...{ bookmarks: update.remove_bookmarks } };
        delete update.remove_bookmarks;
      }
      if (update.remove_followers) {
        if (!Array.isArray(update.remove_followers))
          return res.status(400).json({ ValueError: "should be an array" });
        update.$pullAll = { ...{ followers: update.remove_followers } };
        delete update.remove_followers;
      }
      if (update.remove_blogs) {
        if (!Array.isArray(update.remove_blogs))
          return res.status(400).json({ ValueError: "should be an array" });
        update.$pullAll = { ...{ blogs: update.remove_blogs } };
        delete update.remove_blogs;
      }
      if (update.remove_liked) {
        if (!Array.isArray(update.remove_liked))
          return res.status(400).json({ ValueError: "should be an array" });
        update.$pullAll = { ...{ liked: update.remove_liked } };
        delete update.remove_liked;
      }
      const user = await User.findByIdAndUpdate(req.id, update, {
        new: true,
        runValidators: true,
      });

      res.json(user);
    } catch (err) {
      res.status(500).json({ "ERROR😬": `${err.message}` });
    }
  });

// get specific field of user that refs another
router.get("/user/:field", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.id);
    if (!user) {
      return res
        .status(404)
        .json({ undefined: `🫤 user, ${req.id} does not exist` });
    }
    // TODO:change it to only use one user
    // fields populatable are [friends,following,followers,liked,bookmarks,blogs]
    switch (req.params.field) {
      case "friends":
        try {
          const usersFriends = await User.findById(req.id).populate("friends");
          if (req.query.sort) {
            try {
              const [field, orderStr] = req.query.sort.split("_");
              if (!["asc", "desc"].includes(orderStr))
                return res.json({
                  "Invalid order": ` ${orderStr}, Use fieldName_asc for ascending and fieldName_desc for descending 😉`,
                });
              const order = orderStr === "asc" ? 1 : -1;
              const sortedUsers = await sortUsers(
                User,
                usersFriends.friends,
                field,
                order
              );
              res.json(sortedUsers);
            } catch (err) {
              res.status(500).json({ "OOPS 😬": `${err.message}` });
            }
          } else {
            res.json(usersFriends.friends);
          }
        } catch (err) {
          res.status(500).json({ "ERROR 😬": `${err.message}` });
        }
        break;
      case "following":
        try {
          const usersFollowing = await User.findById(req.id).populate(
            "following"
          );
          if (req.query.sort) {
            try {
              const [field, orderStr] = req.query.sort.split("_");
              if (!["asc", "desc"].includes(orderStr))
                return res.json({
                  "Invalid order": ` ${orderStr}, Use fieldName_asc for ascending and fieldName_desc for descending 😉`,
                });
              const order = orderStr === "asc" ? 1 : -1;
              const sortedUsers = await sortUsers(
                User,
                usersFollowing.following,
                field,
                order
              );
              res.json(sortedUsers);
            } catch (err) {
              res.status(400).json({ "OOPS 😬": `${err.message}` });
            }
          } else {
            res.json(usersFollowing.friends);
          }
        } catch (err) {
          res.status(500).json({ "ERROR 😬": `${err.message}` });
        }
        break;
      case "followers":
        try {
          const usersFollowers = await User.findById(req.id).populate(
            "followers"
          );
          if (req.query.sort) {
            try {
              const [field, orderStr] = req.query.sort.split("_");
              if (!["asc", "desc"].includes(orderStr))
                return res.json({
                  "Invalid order": ` ${orderStr}, Use fieldName_asc for ascending and fieldName_desc for descending 😉`,
                });
              const order = orderStr === "asc" ? 1 : -1;
              const sortedUsers = await sortUsers(
                User,
                usersFollowers.followers,
                field,
                order
              );
              res.json(sortedUsers);
            } catch (err) {
              res.status(400).json({ "OOPS 😬": `${err.message}` });
            }
          } else {
            res.json(usersFollowers.followers);
          }
        } catch (err) {
          res.status(500).json({ "ERROR 😬": `${err.message}` });
        }
        break;
      case "liked":
        try {
          const usersLiked = await User.findById(req.id).populate("liked");
          if (req.query.sort) {
            try {
              const [field, orderStr] = req.query.sort.split("_");
              if (!["asc", "desc"].includes(orderStr))
                return res.json({
                  "Invalid order": ` ${orderStr}, Use fieldName_asc for ascending and fieldName_desc for descending 😉`,
                });
              const order = orderStr === "asc" ? 1 : -1;
              const sortedUsers = await sortUsers(
                User,
                usersLiked.liked,
                field,
                order
              );
              res.json(sortedUsers);
            } catch (err) {
              res.status(400).json({ "OOPS 😬": `${err.message}` });
            }
          } else {
            res.json(usersLiked.liked);
          }
        } catch (err) {
          res.status(500).json({ "ERROR 😬": `${err.message}` });
        }
        break;
      case "bookmarks":
        try {
          const usersBookmarks = await User.findById(req.id).populate(
            "bookmarks"
          );
          res.json(usersBookmarks.bookmarks);
        } catch (err) {
          res.status(500).json({ "ERROR 😬": `${err.message}` });
        }
        break;
      case "blogs":
        try {
          const usersBlogs = await User.findById(req.id).populate("blogs");
          res.json(usersBlogs.blogs);
        } catch (err) {
          res.status(500).json({ "ERROR 😬": `${err.message}` });
        }
        break;
      default:
        res.status(400).json({
          undefined: `🫤 field, ${req.params.field} does not exist or is not populatable`,
        });
    }
  } catch (err) {
    res.status(500).json({ "ERROR 😬": `${err.message}` });
  }
});
module.exports = router;
