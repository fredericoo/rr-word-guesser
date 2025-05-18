export const getDateStamp = (date: Date) => {
	const dateStamp = date.toISOString().split('T')[0];
	if (!dateStamp) throw new Error('Invalid date');
	return dateStamp;
};
