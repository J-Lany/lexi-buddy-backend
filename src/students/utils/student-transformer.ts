import { RawGroupData, StudentFlatData } from './student-data.type';

export function transformGroupsToFlatStudents(
  rawData: RawGroupData[],
): StudentFlatData[] {
  const flatList: StudentFlatData[] = rawData.flatMap((group) => {
    const groupName = group.name;

    return group.students.map((studentInGroup) => {
      const student = studentInGroup.student;

      const telegramContact = student.contacts.find(
        (c) => c.contactType.name === 'telegram',
      );
      const telegramValue = telegramContact?.contactValue;

      let fullName: string | undefined;
      if (student.firstName && student.lastName) {
        fullName = `${student.firstName} ${student.lastName}`;
      } else if (student.firstName) {
        fullName = student.firstName;
      } else if (student.lastName) {
        fullName = student.lastName;
      }

      const studentLevel = student.level || undefined;

      return {
        groupName: groupName,
        id: student.id,
        telegramValue: telegramValue,
        name: fullName,
        level: studentLevel,
      };
    });
  });

  const uniqueStudents = Array.from(
    new Map(flatList.map((item) => [item.id, item])).values(),
  );

  return uniqueStudents;
}
