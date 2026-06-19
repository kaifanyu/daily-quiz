/** The default learning domains this quiz app covers. Used as defaults on the
 *  "new quiz" page and as guidance in the generation prompt. */
export const DEFAULT_TOPICS = [
	'Robotics',
	'Machine Learning Research',
	'Reinforcement Learning',
	'Diffusion Models',
	'ML Fundamentals',
	'ROS2',
	'Embedded Systems',
	'CS Fundamentals',
	'C++ Fundamentals',
	'Memory Management',
	'Deadlocks',
	'Mutexes',
	'Concurrency',
	'Finance',
	'History'
] as const;

export type Topic = (typeof DEFAULT_TOPICS)[number];

export const DIFFICULTIES = ['advanced', 'expert', 'mixed'] as const;
