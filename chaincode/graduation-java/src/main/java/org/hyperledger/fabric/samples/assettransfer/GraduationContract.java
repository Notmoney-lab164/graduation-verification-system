package org.hyperledger.fabric.samples.assettransfer;

import com.owlike.genson.Genson;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.hyperledger.fabric.contract.Context;
import org.hyperledger.fabric.contract.ContractInterface;
import org.hyperledger.fabric.contract.annotation.Contract;
import org.hyperledger.fabric.contract.annotation.Default;
import org.hyperledger.fabric.contract.annotation.Transaction;
import org.hyperledger.fabric.shim.ChaincodeException;
import org.hyperledger.fabric.shim.ChaincodeStub;
import org.hyperledger.fabric.shim.ledger.KeyValue;
import org.hyperledger.fabric.shim.ledger.QueryResultsIterator;

@Contract(name = "graduation")
@Default
public final class GraduationContract implements ContractInterface {

    private static final String AUTHORIZED_ISSUER_MSP = "Org1MSP";

    private static final Set<String> VALID_GRADUATION_STATUS = Set.of(
            "GRADUATED",
            "NOT_GRADUATED",
            "PENDING",
            "REVOKED");

    private final Genson genson = new Genson();

    private enum GraduationErrors {
        STUDENT_NOT_FOUND,
        STUDENT_ALREADY_EXISTS,
        UNAUTHORIZED_ORGANIZATION,
        INVALID_INPUT
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Student createStudent(
            final Context ctx,
            final String studentId,
            final String fullName,
            final String dateOfBirth,
            final String citizenIdHash,
            final String institutionCode,
            final String institutionName,
            final String facultyName,
            final String major,
            final String degreeId,
            final String degreeType,
            final String graduationStatus,
            final String graduationDate,
            final String graduationYear,
            final String classification,
            final String gpa,
            final String totalCredits,
            final String entranceYear,
            final String issuerSignature) {
        requireAuthorizedIssuer(ctx);
        validateRequired(studentId, "studentId");
        validateRequired(citizenIdHash, "citizenIdHash");
        validateRequired(degreeId, "degreeId");
        validateRequired(issuerSignature, "issuerSignature");

        validateStudentData(
                dateOfBirth,
                graduationStatus,
                graduationDate,
                graduationYear,
                gpa,
                totalCredits,
                entranceYear);

        ChaincodeStub stub = ctx.getStub();

        if (studentExists(ctx, studentId)) {
            throw new ChaincodeException(
                    "Student " + studentId + " already exists",
                    GraduationErrors.STUDENT_ALREADY_EXISTS.toString());
        }

        String organizationMsp = ctx.getClientIdentity().getMSPID();
        String ledgerTimestamp = stub.getTxTimestamp().toString();

        String metadataHash = calculateMetadataHash(
                studentId,
                fullName,
                dateOfBirth,
                citizenIdHash,
                institutionCode,
                institutionName,
                facultyName,
                major,
                degreeId,
                degreeType,
                graduationStatus,
                graduationDate,
                graduationYear,
                classification,
                gpa,
                totalCredits,
                entranceYear);

        Student student = new Student(
                studentId,
                fullName,
                dateOfBirth,
                citizenIdHash,
                institutionCode,
                institutionName,
                facultyName,
                major,
                degreeId,
                degreeType,
                graduationStatus,
                graduationDate,
                graduationYear,
                classification,
                gpa,
                totalCredits,
                entranceYear,
                metadataHash,
                issuerSignature,
                organizationMsp,
                ledgerTimestamp,
                ledgerTimestamp,
                ledgerTimestamp);

        stub.putStringState(studentId, genson.serialize(student));
        return student;
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Student updateGraduationStatus(
            final Context ctx,
            final String studentId,
            final String graduationStatus,
            final String graduationDate,
            final String graduationYear,
            final String classification,
            final String gpa,
            final String totalCredits,
            final String issuerSignature) {
        requireAuthorizedIssuer(ctx);
        validateRequired(studentId, "studentId");
        validateRequired(issuerSignature, "issuerSignature");

        Student oldStudent = queryStudent(ctx, studentId);

        validateStudentData(
                oldStudent.getDateOfBirth(),
                graduationStatus,
                graduationDate,
                graduationYear,
                gpa,
                totalCredits,
                oldStudent.getEntranceYear());

        String ledgerTimestamp = ctx.getStub().getTxTimestamp().toString();
        String organizationMsp = ctx.getClientIdentity().getMSPID();

        String metadataHash = calculateMetadataHash(
                oldStudent.getStudentId(),
                oldStudent.getFullName(),
                oldStudent.getDateOfBirth(),
                oldStudent.getCitizenIdHash(),
                oldStudent.getInstitutionCode(),
                oldStudent.getInstitutionName(),
                oldStudent.getFacultyName(),
                oldStudent.getMajor(),
                oldStudent.getDegreeId(),
                oldStudent.getDegreeType(),
                graduationStatus,
                graduationDate,
                graduationYear,
                classification,
                gpa,
                totalCredits,
                oldStudent.getEntranceYear());

        Student updatedStudent = new Student(
                oldStudent.getStudentId(),
                oldStudent.getFullName(),
                oldStudent.getDateOfBirth(),
                oldStudent.getCitizenIdHash(),
                oldStudent.getInstitutionCode(),
                oldStudent.getInstitutionName(),
                oldStudent.getFacultyName(),
                oldStudent.getMajor(),
                oldStudent.getDegreeId(),
                oldStudent.getDegreeType(),
                graduationStatus,
                graduationDate,
                graduationYear,
                classification,
                gpa,
                totalCredits,
                oldStudent.getEntranceYear(),
                metadataHash,
                issuerSignature,
                organizationMsp,
                ledgerTimestamp,
                oldStudent.getCreatedAt(),
                ledgerTimestamp);

        ctx.getStub().putStringState(studentId, genson.serialize(updatedStudent));
        return updatedStudent;
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public Student queryStudent(final Context ctx, final String studentId) {
        String studentJson = ctx.getStub().getStringState(studentId);

        if (studentJson == null || studentJson.isEmpty()) {
            throw new ChaincodeException(
                    "Student " + studentId + " does not exist",
                    GraduationErrors.STUDENT_NOT_FOUND.toString());
        }

        return genson.deserialize(studentJson, Student.class);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public String verifyGraduation(final Context ctx, final String studentId) {
        Student student = queryStudent(ctx, studentId);
        return student.getGraduationStatus();
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public boolean verifyStudentIntegrity(final Context ctx, final String studentId) {
        Student student = queryStudent(ctx, studentId);

        String recalculatedHash = calculateMetadataHash(
                student.getStudentId(),
                student.getFullName(),
                student.getDateOfBirth(),
                student.getCitizenIdHash(),
                student.getInstitutionCode(),
                student.getInstitutionName(),
                student.getFacultyName(),
                student.getMajor(),
                student.getDegreeId(),
                student.getDegreeType(),
                student.getGraduationStatus(),
                student.getGraduationDate(),
                student.getGraduationYear(),
                student.getClassification(),
                student.getGpa(),
                student.getTotalCredits(),
                student.getEntranceYear());

        return recalculatedHash.equals(student.getMetadataHash());
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public boolean studentExists(final Context ctx, final String studentId) {
        String studentJson = ctx.getStub().getStringState(studentId);
        return studentJson != null && !studentJson.isEmpty();
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public int countStudents(final Context ctx) {
        return listStudentIds(ctx).length;
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public String[] listStudentIds(final Context ctx) {
        ChaincodeStub stub = ctx.getStub();
        List<String> ids = new ArrayList<>();

        try (QueryResultsIterator<KeyValue> results = stub.getStateByRange("", "")) {
            for (KeyValue kv : results) {
                String key = kv.getKey();
                String value = kv.getStringValue();

                if (value == null || value.isEmpty()) {
                    continue;
                }

                try {
                    genson.deserialize(value, Student.class);
                    ids.add(key);
                } catch (Exception ignored) {
                    // Skip non-student records.
                }
            }
        } catch (Exception exception) {
            throw new ChaincodeException(
                    "Failed to list students: " + exception.getMessage(),
                    GraduationErrors.INVALID_INPUT.toString());
        }

        return ids.toArray(new String[0]);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public String getAllStudents(final Context ctx) {
        ChaincodeStub stub = ctx.getStub();
        List<Student> students = new ArrayList<>();

        try (QueryResultsIterator<KeyValue> results = stub.getStateByRange("", "")) {
            for (KeyValue kv : results) {
                String value = kv.getStringValue();

                if (value == null || value.isEmpty()) {
                    continue;
                }

                try {
                    Student student = genson.deserialize(value, Student.class);
                    students.add(student);
                } catch (Exception ignored) {
                    // Skip non-student records.
                }
            }
        } catch (Exception exception) {
            throw new ChaincodeException(
                    "Failed to get all students: " + exception.getMessage(),
                    GraduationErrors.INVALID_INPUT.toString());
        }

        return genson.serialize(students);
    }

    private void requireAuthorizedIssuer(final Context ctx) {
        String mspId = ctx.getClientIdentity().getMSPID();

        if (!AUTHORIZED_ISSUER_MSP.equals(mspId)) {
            throw new ChaincodeException(
                    "Only " + AUTHORIZED_ISSUER_MSP + " can write graduation records",
                    GraduationErrors.UNAUTHORIZED_ORGANIZATION.toString());
        }
    }

    private void validateStudentData(
            final String dateOfBirth,
            final String graduationStatus,
            final String graduationDate,
            final String graduationYear,
            final String gpa,
            final String totalCredits,
            final String entranceYear) {
        validateDate(dateOfBirth, "dateOfBirth");
        validateDate(graduationDate, "graduationDate");
        validateYear(graduationYear, "graduationYear");
        validateYear(entranceYear, "entranceYear");
        validateGraduationStatus(graduationStatus);
        validateGpa(gpa);
        validatePositiveInteger(totalCredits, "totalCredits");
    }

    private void validateRequired(final String value, final String fieldName) {
        if (value == null || value.trim().isEmpty()) {
            throw new ChaincodeException(
                    fieldName + " is required",
                    GraduationErrors.INVALID_INPUT.toString());
        }
    }

    private void validateGraduationStatus(final String graduationStatus) {
        validateRequired(graduationStatus, "graduationStatus");

        if (!VALID_GRADUATION_STATUS.contains(graduationStatus)) {
            throw new ChaincodeException(
                    "graduationStatus must be one of " + VALID_GRADUATION_STATUS,
                    GraduationErrors.INVALID_INPUT.toString());
        }
    }

    private void validateDate(final String value, final String fieldName) {
        validateRequired(value, fieldName);

        try {
            LocalDate.parse(value);
        } catch (DateTimeParseException exception) {
            throw new ChaincodeException(
                    fieldName + " must use format YYYY-MM-DD",
                    GraduationErrors.INVALID_INPUT.toString());
        }
    }

    private void validateYear(final String value, final String fieldName) {
        validateRequired(value, fieldName);

        try {
            int year = Integer.parseInt(value);

            if (year < 1900 || year > 2100) {
                throw new NumberFormatException();
            }
        } catch (NumberFormatException exception) {
            throw new ChaincodeException(
                    fieldName + " must be a valid year",
                    GraduationErrors.INVALID_INPUT.toString());
        }
    }

    private void validateGpa(final String value) {
        validateRequired(value, "gpa");

        try {
            double parsedGpa = Double.parseDouble(value);

            if (parsedGpa < 0.0 || parsedGpa > 4.0) {
                throw new NumberFormatException();
            }
        } catch (NumberFormatException exception) {
            throw new ChaincodeException(
                    "gpa must be between 0.0 and 4.0",
                    GraduationErrors.INVALID_INPUT.toString());
        }
    }

    private void validatePositiveInteger(final String value, final String fieldName) {
        validateRequired(value, fieldName);

        try {
            int number = Integer.parseInt(value);

            if (number <= 0) {
                throw new NumberFormatException();
            }
        } catch (NumberFormatException exception) {
            throw new ChaincodeException(
                    fieldName + " must be a positive integer",
                    GraduationErrors.INVALID_INPUT.toString());
        }
    }

    private String calculateMetadataHash(final String... values) {
        StringBuilder builder = new StringBuilder();

        for (String value : values) {
            builder.append(value == null ? "" : value.trim()).append("|");
        }

        return sha256(builder.toString());
    }

    private String sha256(final String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] encodedHash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();

            for (byte hashByte : encodedHash) {
                String hex = Integer.toHexString(0xff & hashByte);

                if (hex.length() == 1) {
                    hexString.append('0');
                }

                hexString.append(hex);
            }

            return hexString.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new ChaincodeException(
                    exception.getMessage(),
                    GraduationErrors.INVALID_INPUT.toString());
        }
    }
}