interface RawContact {
  contactValue: string;
  contactType: {
    name: string;
  };
}

interface RawStudent {
  id: number;
  firstName: string | null;
  lastName: string | null;
  level: string | null;
  contacts: RawContact[];
}

export interface RawGroupData {
  name: string;
  students: {
    student: RawStudent;
  }[];
}

export interface StudentFlatData {
  groupName: string;
  id: number;
  telegramValue: string | undefined;
  name: string | undefined;
  level: string | undefined;
}
