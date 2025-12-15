export const typeDefs = `#graphql
  type User {
    id: ID!
    name: String!
    email: String!
    avatar: String
    level: Int!
    points: Int!
    isActive: Boolean!
    quests: [Quest!]!
    createdAt: String!
    monster: Monster!
  }

  type Quest {
    id: ID!
    title: String!
    description: String!
    subject: String!
    difficulty: Int!
    reward: Int!
    creator: User!
    submissions: [Submission!]!
    createdAt: String!
  }

  type Submission {
    id: ID!
    content: String!
    fileUrl: String
    grade: Int!
    feedback: String
    quest: Quest!
    author: User!
    createdAt: String!
  }

  type Monster {
    id: ID!
    name: String!
    level: Int!
    hunger: Int!
    multiplier: Float!
    evolutionStage: String!
  }

  type LeaderboardEntry {
    id: ID!
    user: User!
    score: Int!
    rank: Int!
    period: String!
  }

  type Query {
    users: [User!]!
    user(id: ID!): User
    quests(subject: String): [Quest!]!
    quest(id: ID!): Quest
    submissions(questId: ID!): [Submission!]!
    leaderboard: [LeaderboardEntry!]!
    monster(userId: ID!): Monster
    me: User!
  }

  type Mutation {
    createUser(name: String!, email: String!, password: String!): User!
    login(email: String!, password: String!): String!
    createQuest(title: String!, description: String!, subject: String!, difficulty: Int!, reward: Int!): Quest!
    createSubmission(content: String!, questId: ID!, fileUrl: String): Submission!
    gradeSubmission(submissionId: ID!, grade: Int!, feedback: String): Submission!
    updateQuest(id: ID!, title: String!, description: String!): Quest! 
    deleteSubmission(id: ID!): Boolean!                               
  }

  type Subscription {
    newSubmission: Submission!
  }
` as const;
