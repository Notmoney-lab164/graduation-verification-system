package org.hyperledger.fabric.samples.assettransfer;

import com.owlike.genson.Genson;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.hyperledger.fabric.contract.Context;
import org.hyperledger.fabric.contract.ContractInterface;
import org.hyperledger.fabric.contract.annotation.Contract;
import org.hyperledger.fabric.contract.annotation.Default;
import org.hyperledger.fabric.contract.annotation.Transaction;
import org.hyperledger.fabric.shim.ChaincodeException;
import org.hyperledger.fabric.shim.ChaincodeStub;

/**
 * Hợp đồng thông minh (Smart Contract) quản lý dữ liệu tốt nghiệp sinh viên
 * trên nền tảng Hyperledger Fabric.
 *
 * <p>Contract này cung cấp các chức năng chính:</p>
 * <ul>
 *   <li>Tạo mới bản ghi sinh viên lên ledger.</li>
 *   <li>Truy vấn thông tin sinh viên từ ledger.</li>
 *   <li>Cập nhật trạng thái tốt nghiệp.</li>
 *   <li>Xác thực tốt nghiệp và kiểm tra tính toàn vẹn dữ liệu.</li>
 * </ul>
 *
 * <p><b>Bảo mật:</b></p>
 * <ul>
 *   <li>Chỉ tổ chức có MSP ID khớp với {@code AUTHORIZED_ISSUER_MSP}
 *       mới được phép ghi dữ liệu lên ledger.</li>
 *   <li>Mỗi bản ghi đều được tính {@code metadataHash} (SHA-256)
 *       để phát hiện bất kỳ thay đổi trái phép nào sau khi commit.</li>
 *   <li>Số CCCD không lưu dạng plain text — chỉ lưu {@code citizenIdHash}.</li>
 * </ul>
 *
 * <p><b>Loại transaction:</b></p>
 * <ul>
 *   <li>{@code SUBMIT} — ghi dữ liệu, yêu cầu đồng thuận (endorsement) từ các peer.</li>
 *   <li>{@code EVALUATE} — chỉ đọc, không cần đồng thuận, không tốn phí.</li>
 * </ul>
 *
 * @see Student
 * @version 1.0
 */
@Contract(name = "graduation")
@Default
public final class GraduationContract implements ContractInterface {

    /**
     * MSP ID của tổ chức duy nhất được phép ghi dữ liệu tốt nghiệp lên ledger.
     *
     * <p>Mọi transaction {@code SUBMIT} đều kiểm tra MSP ID của người gọi
     * với hằng số này. Nếu không khớp, transaction bị từ chối ngay lập tức.</p>
     *
     * <p>Thay đổi giá trị này để phù hợp với tên tổ chức trong
     * file {@code configtx.yaml} của mạng Hyperledger Fabric.</p>
     */
    private static final String AUTHORIZED_ISSUER_MSP = "Org1MSP";

    /**
     * Thư viện Genson dùng để serialize/deserialize đối tượng {@link Student}
     * sang/từ định dạng JSON khi đọc/ghi vào World State của Fabric.
     */
    private final Genson genson = new Genson();

    /**
     * Danh sách mã lỗi chuẩn của contract.
     *
     * <p>Được dùng làm tham số thứ hai trong {@link ChaincodeException}
     * để client phân loại lỗi mà không cần parse message text.</p>
     *
     * <ul>
     *   <li>{@code STUDENT_NOT_FOUND} — Không tìm thấy sinh viên theo ID.</li>
     *   <li>{@code STUDENT_ALREADY_EXISTS} — Sinh viên đã tồn tại trên ledger.</li>
     *   <li>{@code UNAUTHORIZED_ORGANIZATION} — Tổ chức không có quyền ghi dữ liệu.</li>
     *   <li>{@code INVALID_INPUT} — Dữ liệu đầu vào thiếu hoặc không hợp lệ.</li>
     * </ul>
     */
    private enum GraduationErrors {
        STUDENT_NOT_FOUND,
        STUDENT_ALREADY_EXISTS,
        UNAUTHORIZED_ORGANIZATION,
        INVALID_INPUT
    }

    // =========================================================
    // TRANSACTION — SUBMIT (Ghi dữ liệu)
    // =========================================================

    /**
     * Tạo mới một bản ghi sinh viên và ghi vĩnh viễn lên Hyperledger Fabric Ledger.
     *
     * <p><b>Luồng xử lý:</b></p>
     * <ol>
     *   <li>Kiểm tra MSP ID của người gọi — chỉ {@code AUTHORIZED_ISSUER_MSP} được phép.</li>
     *   <li>Validate các trường bắt buộc: {@code studentId}, {@code citizenIdHash},
     *       {@code degreeId}, {@code issuerSignature}.</li>
     *   <li>Kiểm tra sinh viên chưa tồn tại trên ledger.</li>
     *   <li>Tự động lấy {@code organizationMsp} và {@code ledgerTimestamp}
     *       từ context của transaction — không nhận từ client.</li>
     *   <li>Tính {@code metadataHash} (SHA-256) từ toàn bộ dữ liệu.</li>
     *   <li>Serialize đối tượng {@link Student} thành JSON và ghi vào World State.</li>
     * </ol>
     *
     * <p><b>Lưu ý:</b> {@code createdAt}, {@code updatedAt}, {@code ledgerTimestamp}
     * đều được gán bằng {@code stub.getTxTimestamp()} — thời điểm
     * transaction được tạo, không phải thời điểm client gửi request.</p>
     *
     * @param ctx              Context của Fabric — chứa stub và thông tin identity người gọi
     * @param studentId        Mã sinh viên (khóa chính trên ledger)
     * @param fullName         Họ và tên sinh viên
     * @param dateOfBirth      Ngày sinh (yyyy-MM-dd)
     * @param citizenIdHash    Hash SHA-256 của số CCCD
     * @param institutionCode  Mã trường
     * @param institutionName  Tên trường
     * @param facultyName      Tên khoa
     * @param major            Ngành học
     * @param degreeId         Mã văn bằng (duy nhất)
     * @param degreeType       Loại văn bằng (Cử nhân / Kỹ sư...)
     * @param graduationStatus Trạng thái tốt nghiệp (GRADUATED / PENDING...)
     * @param graduationDate   Ngày tốt nghiệp (yyyy-MM-dd)
     * @param graduationYear   Năm tốt nghiệp
     * @param classification   Xếp loại tốt nghiệp
     * @param gpa              Điểm trung bình tích lũy
     * @param totalCredits     Tổng số tín chỉ tích lũy
     * @param entranceYear     Năm nhập học
     * @param issuerSignature  Chữ ký số của người đại diện trường cấp bằng
     * @return Đối tượng {@link Student} vừa được tạo và ghi lên ledger
     * @throws ChaincodeException {@code UNAUTHORIZED_ORGANIZATION} nếu MSP ID không hợp lệ
     * @throws ChaincodeException {@code INVALID_INPUT} nếu trường bắt buộc bị thiếu
     * @throws ChaincodeException {@code STUDENT_ALREADY_EXISTS} nếu studentId đã tồn tại
     */
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

        ChaincodeStub stub = ctx.getStub();

        if (studentExists(ctx, studentId)) {
            throw new ChaincodeException(
                    "Student " + studentId + " already exists",
                    GraduationErrors.STUDENT_ALREADY_EXISTS.toString());
        }

        String organizationMsp = ctx.getClientIdentity().getMSPID();
        String ledgerTimestamp = stub.getTxTimestamp().toString();

        String metadataHash = calculateMetadataHash(
                studentId, fullName, dateOfBirth, citizenIdHash,
                institutionCode, institutionName, facultyName, major,
                degreeId, degreeType, graduationStatus, graduationDate,
                graduationYear, classification, gpa, totalCredits, entranceYear);

        Student student = new Student(
                studentId, fullName, dateOfBirth, citizenIdHash,
                institutionCode, institutionName, facultyName, major,
                degreeId, degreeType, graduationStatus, graduationDate,
                graduationYear, classification, gpa, totalCredits, entranceYear,
                metadataHash, issuerSignature, organizationMsp,
                ledgerTimestamp, ledgerTimestamp, ledgerTimestamp);

        stub.putStringState(studentId, genson.serialize(student));

        return student;
    }

    /**
     * Cập nhật thông tin tốt nghiệp của sinh viên đã tồn tại trên ledger.
     *
     * <p><b>Luồng xử lý:</b></p>
     * <ol>
     *   <li>Kiểm tra MSP ID của người gọi.</li>
     *   <li>Validate {@code studentId} và {@code issuerSignature}.</li>
     *   <li>Đọc bản ghi sinh viên cũ từ ledger.</li>
     *   <li>Tính lại {@code metadataHash} mới từ dữ liệu kết hợp
     *       (dữ liệu cũ + các trường tốt nghiệp mới).</li>
     *   <li>Tạo đối tượng {@link Student} mới — giữ nguyên {@code createdAt},
     *       cập nhật {@code updatedAt} và {@code ledgerTimestamp}.</li>
     *   <li>Ghi đè lên World State (tạo transaction mới, không xóa block cũ).</li>
     * </ol>
     *
     * <p><b>Lưu ý:</b> Blockchain không xóa dữ liệu cũ — lịch sử các lần
     * cập nhật vẫn được lưu trong transaction history và có thể truy vấn lại.</p>
     *
     * @param ctx              Context của Fabric
     * @param studentId        Mã sinh viên cần cập nhật
     * @param graduationStatus Trạng thái tốt nghiệp mới
     * @param graduationDate   Ngày tốt nghiệp mới
     * @param graduationYear   Năm tốt nghiệp mới
     * @param classification   Xếp loại tốt nghiệp mới
     * @param gpa              Điểm GPA mới
     * @param totalCredits     Tổng tín chỉ mới
     * @param issuerSignature  Chữ ký số mới của người cấp bằng
     * @return Đối tượng {@link Student} sau khi cập nhật
     * @throws ChaincodeException {@code UNAUTHORIZED_ORGANIZATION} nếu MSP ID không hợp lệ
     * @throws ChaincodeException {@code INVALID_INPUT} nếu trường bắt buộc bị thiếu
     * @throws ChaincodeException {@code STUDENT_NOT_FOUND} nếu sinh viên không tồn tại
     */
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
        String ledgerTimestamp = ctx.getStub().getTxTimestamp().toString();
        String organizationMsp = ctx.getClientIdentity().getMSPID();

        String metadataHash = calculateMetadataHash(
                oldStudent.getStudentId(), oldStudent.getFullName(),
                oldStudent.getDateOfBirth(), oldStudent.getCitizenIdHash(),
                oldStudent.getInstitutionCode(), oldStudent.getInstitutionName(),
                oldStudent.getFacultyName(), oldStudent.getMajor(),
                oldStudent.getDegreeId(), oldStudent.getDegreeType(),
                graduationStatus, graduationDate, graduationYear,
                classification, gpa, totalCredits, oldStudent.getEntranceYear());

        Student updatedStudent = new Student(
                oldStudent.getStudentId(), oldStudent.getFullName(),
                oldStudent.getDateOfBirth(), oldStudent.getCitizenIdHash(),
                oldStudent.getInstitutionCode(), oldStudent.getInstitutionName(),
                oldStudent.getFacultyName(), oldStudent.getMajor(),
                oldStudent.getDegreeId(), oldStudent.getDegreeType(),
                graduationStatus, graduationDate, graduationYear,
                classification, gpa, totalCredits, oldStudent.getEntranceYear(),
                metadataHash, issuerSignature, organizationMsp,
                ledgerTimestamp, oldStudent.getCreatedAt(), ledgerTimestamp);

        ctx.getStub().putStringState(studentId, genson.serialize(updatedStudent));

        return updatedStudent;
    }

    // =========================================================
    // TRANSACTION — EVALUATE (Chỉ đọc)
    // =========================================================

    /**
     * Truy vấn toàn bộ thông tin của một sinh viên từ World State.
     *
     * <p>Transaction {@code EVALUATE} — chỉ đọc, không tạo block mới,
     * không cần endorsement từ nhiều peer, không tốn phí gas.</p>
     *
     * @param ctx       Context của Fabric
     * @param studentId Mã sinh viên cần truy vấn
     * @return Đối tượng {@link Student} chứa đầy đủ thông tin từ ledger
     * @throws ChaincodeException {@code STUDENT_NOT_FOUND} nếu không tìm thấy sinh viên
     */
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

    /**
     * Xác thực trạng thái tốt nghiệp của sinh viên.
     *
     * <p>Đây là transaction công khai — bên thứ ba (nhà tuyển dụng,
     * cơ quan nhà nước) dùng để kiểm tra nhanh sinh viên đã tốt nghiệp chưa
     * mà không cần xem toàn bộ thông tin.</p>
     *
     * <p>Transaction {@code EVALUATE} — chỉ đọc, không tạo block mới.</p>
     *
     * @param ctx       Context của Fabric
     * @param studentId Mã sinh viên cần xác thực
     * @return Chuỗi trạng thái tốt nghiệp: {@code "GRADUATED"}, {@code "PENDING"},
     *         hoặc {@code "NOT_GRADUATED"}
     * @throws ChaincodeException {@code STUDENT_NOT_FOUND} nếu không tìm thấy sinh viên
     */
    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public String verifyGraduation(final Context ctx, final String studentId) {
        Student student = queryStudent(ctx, studentId);
        return student.getGraduationStatus();
    }

    /**
     * Kiểm tra tính toàn vẹn dữ liệu của bản ghi sinh viên trên ledger.
     *
     * <p><b>Nguyên lý hoạt động:</b></p>
     * <ol>
     *   <li>Đọc bản ghi sinh viên từ ledger, lấy {@code metadataHash} đang lưu.</li>
     *   <li>Tính lại SHA-256 hash từ toàn bộ trường dữ liệu hiện tại.</li>
     *   <li>So sánh hash vừa tính với {@code metadataHash} trên ledger.</li>
     *   <li>Nếu khớp → dữ liệu nguyên vẹn. Nếu không khớp → dữ liệu bị can thiệp.</li>
     * </ol>
     *
     * <p><b>Lưu ý:</b> Phương thức này phát hiện được thay đổi trái phép
     * ở tầng off-chain (database, API), nhưng không thể phát hiện nếu
     * kẻ tấn công đã ghi transaction hợp lệ lên ledger.</p>
     *
     * <p>Transaction {@code EVALUATE} — chỉ đọc, không tạo block mới.</p>
     *
     * @param ctx       Context của Fabric
     * @param studentId Mã sinh viên cần kiểm tra
     * @return {@code true} nếu dữ liệu toàn vẹn, {@code false} nếu bị chỉnh sửa
     * @throws ChaincodeException {@code STUDENT_NOT_FOUND} nếu không tìm thấy sinh viên
     */
    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public boolean verifyStudentIntegrity(final Context ctx, final String studentId) {
        Student student = queryStudent(ctx, studentId);

        String recalculatedHash = calculateMetadataHash(
                student.getStudentId(), student.getFullName(),
                student.getDateOfBirth(), student.getCitizenIdHash(),
                student.getInstitutionCode(), student.getInstitutionName(),
                student.getFacultyName(), student.getMajor(),
                student.getDegreeId(), student.getDegreeType(),
                student.getGraduationStatus(), student.getGraduationDate(),
                student.getGraduationYear(), student.getClassification(),
                student.getGpa(), student.getTotalCredits(),
                student.getEntranceYear());

        return recalculatedHash.equals(student.getMetadataHash());
    }

    /**
     * Kiểm tra một sinh viên đã tồn tại trên ledger hay chưa.
     *
     * <p>Dùng nội bộ trong {@link #createStudent} để tránh ghi đè bản ghi.
     * Cũng có thể gọi trực tiếp từ client để kiểm tra trước khi tạo mới.</p>
     *
     * <p>Transaction {@code EVALUATE} — chỉ đọc, không tạo block mới.</p>
     *
     * @param ctx       Context của Fabric
     * @param studentId Mã sinh viên cần kiểm tra
     * @return {@code true} nếu sinh viên đã tồn tại, {@code false} nếu chưa
     */
    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public boolean studentExists(final Context ctx, final String studentId) {
        String studentJson = ctx.getStub().getStringState(studentId);
        return studentJson != null && !studentJson.isEmpty();
    }

    // =========================================================
    // PRIVATE HELPERS
    // =========================================================

    /**
     * Kiểm tra MSP ID của người gọi có khớp với {@code AUTHORIZED_ISSUER_MSP} không.
     *
     * <p>Được gọi đầu tiên trong mọi transaction {@code SUBMIT}.
     * Nếu không hợp lệ, transaction bị hủy ngay lập tức trước khi
     * thực hiện bất kỳ thao tác nào khác.</p>
     *
     * @param ctx Context của Fabric — dùng để lấy MSP ID người gọi
     * @throws ChaincodeException {@code UNAUTHORIZED_ORGANIZATION}
     *         nếu MSP ID không khớp với {@code AUTHORIZED_ISSUER_MSP}
     */
    private void requireAuthorizedIssuer(final Context ctx) {
        String mspId = ctx.getClientIdentity().getMSPID();

        if (!AUTHORIZED_ISSUER_MSP.equals(mspId)) {
            throw new ChaincodeException(
                    "Only " + AUTHORIZED_ISSUER_MSP + " can write graduation records",
                    GraduationErrors.UNAUTHORIZED_ORGANIZATION.toString());
        }
    }

    /**
     * Kiểm tra một trường dữ liệu bắt buộc không được null hoặc rỗng.
     *
     * @param value     Giá trị cần kiểm tra
     * @param fieldName Tên trường — dùng trong thông báo lỗi để client biết trường nào bị thiếu
     * @throws ChaincodeException {@code INVALID_INPUT} nếu {@code value} là null hoặc chỉ có khoảng trắng
     */
    private void validateRequired(final String value, final String fieldName) {
        if (value == null || value.trim().isEmpty()) {
            throw new ChaincodeException(
                    fieldName + " is required",
                    GraduationErrors.INVALID_INPUT.toString());
        }
    }

    /**
     * Tính SHA-256 hash từ danh sách các giá trị trường dữ liệu.
     *
     * <p><b>Cách ghép chuỗi:</b> Các giá trị được nối với nhau bằng ký tự
     * phân tách {@code "|"} để tránh trường hợp hai chuỗi khác nhau
     * cho cùng một kết quả sau khi ghép (hash collision giả tạo).
     * Giá trị {@code null} được xử lý thành chuỗi rỗng {@code ""}.</p>
     *
     * <p><b>Ví dụ:</b> {@code "SV003|Le Van C|2002-08-15|..."}</p>
     *
     * @param values Danh sách các giá trị trường dữ liệu theo thứ tự cố định
     * @return Chuỗi hex SHA-256 64 ký tự
     * @throws ChaincodeException {@code INVALID_INPUT} nếu thuật toán SHA-256 không khả dụng
     */
    private String calculateMetadataHash(final String... values) {
        StringBuilder builder = new StringBuilder();

        for (String value : values) {
            builder.append(value == null ? "" : value.trim()).append("|");
        }

        return sha256(builder.toString());
    }

    /**
     * Tính SHA-256 của một chuỗi đầu vào và trả về dạng hex lowercase.
     *
     * <p>Encoding sử dụng {@code UTF-8} để đảm bảo nhất quán giữa
     * các môi trường khác nhau (Windows/Linux/Mac).</p>
     *
     * <p><b>Ví dụ kết quả:</b>
     * {@code "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d906"}</p>
     *
     * @param input Chuỗi đầu vào cần hash
     * @return Chuỗi hex SHA-256 gồm 64 ký tự lowercase
     * @throws ChaincodeException {@code INVALID_INPUT} nếu JVM không hỗ trợ SHA-256
     *         (không xảy ra trong môi trường Fabric tiêu chuẩn)
     */
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
