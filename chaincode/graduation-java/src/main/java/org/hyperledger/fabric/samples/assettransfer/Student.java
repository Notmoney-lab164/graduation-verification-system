package org.hyperledger.fabric.samples.assettransfer;

import com.owlike.genson.annotation.JsonCreator;
import com.owlike.genson.annotation.JsonProperty;
import org.hyperledger.fabric.contract.annotation.DataType;
import org.hyperledger.fabric.contract.annotation.Property;

/**
 * Đại diện cho dữ liệu sinh viên được lưu trữ trên Hyperledger Fabric Ledger.
 *
 * <p>Class này được dùng làm kiểu dữ liệu (DataType) trong Chaincode.
 * Mỗi đối tượng {@code Student} tương ứng với một bản ghi sinh viên
 * được ghi vĩnh viễn và bất biến (immutable) lên World State của Fabric.</p>
 *
 * <p><b>Lưu ý bảo mật:</b></p>
 * <ul>
 *   <li>Số CCCD KHÔNG được lưu dạng plain text — chỉ lưu {@code citizenIdHash} (SHA-256).</li>
 *   <li>{@code metadataHash} dùng để phát hiện dữ liệu bị chỉnh sửa ngoài ledger.</li>
 *   <li>{@code issuerSignature} dùng để xác thực bằng do trường cấp, không bị giả mạo.</li>
 * </ul>
 *
 * @author Blockchain Graduation Team
 * @version 1.0
 */
@DataType()
public final class Student {

    // =========================================================
    // PHẦN 1 — Thông tin định danh sinh viên
    // =========================================================

    /**
     * Mã sinh viên — khóa chính (Primary Key) trên ledger.
     *
     * <p>Dùng làm Composite Key khi lưu vào World State.
     * Phải là duy nhất trong toàn bộ hệ thống.</p>
     *
     * <p>Ví dụ: {@code "SV003"}</p>
     */
    @Property()
    private final String studentId;

    /**
     * Họ và tên đầy đủ của sinh viên.
     *
     * <p>Lưu dạng plain text. Nếu cần bảo mật cao hơn,
     * cân nhắc mã hóa trường này bằng AES trước khi ghi lên ledger.</p>
     *
     * <p>Ví dụ: {@code "Le Van C"}</p>
     */
    @Property()
    private final String fullName;

    /**
     * Ngày sinh của sinh viên theo định dạng {@code yyyy-MM-dd}.
     *
     * <p>Ví dụ: {@code "2002-08-15"}</p>
     */
    @Property()
    private final String dateOfBirth;

    /**
     * Mã băm (SHA-256) của số Căn cước công dân.
     *
     * <p><b>Bảo mật:</b> Số CCCD gốc KHÔNG được lưu trực tiếp lên ledger.
     * Thay vào đó, hệ thống tính SHA-256 của số CCCD và chỉ lưu hash này.
     * Điều này bảo vệ thông tin cá nhân nhạy cảm trong trường hợp ledger
     * bị truy cập trái phép.</p>
     *
     * <p>Ví dụ: {@code "a3f2b1c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"}</p>
     */
    @Property()
    private final String citizenIdHash;

    // =========================================================
    // PHẦN 2 — Thông tin trường & chương trình đào tạo
    // =========================================================

    /**
     * Mã trường đại học theo chuẩn Bộ GD&ĐT.
     *
     * <p>Dùng để định danh tổ chức cấp bằng trong hệ thống.
     * Chaincode sẽ kiểm tra mã này với danh sách trường hợp lệ
     * trước khi cho phép ghi dữ liệu.</p>
     *
     * <p>Ví dụ: {@code "FPT"}, {@code "BKA"}, {@code "HCMUS"}</p>
     */
    @Property()
    private final String institutionCode;

    /**
     * Tên đầy đủ của trường đại học cấp bằng.
     *
     * <p>Ví dụ: {@code "Đại học FPT"}</p>
     */
    @Property()
    private final String institutionName;

    /**
     * Tên khoa hoặc viện mà sinh viên theo học.
     *
     * <p>Ví dụ: {@code "Khoa Công nghệ Thông tin"}</p>
     */
    @Property()
    private final String facultyName;

    /**
     * Ngành học của sinh viên.
     *
     * <p>Ví dụ: {@code "Software Engineering"}, {@code "Artificial Intelligence"}</p>
     */
    @Property()
    private final String major;

    // =========================================================
    // PHẦN 3 — Thông tin văn bằng
    // =========================================================

    /**
     * Mã định danh duy nhất của văn bằng tốt nghiệp.
     *
     * <p>Đây là mã tra cứu công khai — người dùng nhập mã này
     * vào hệ thống để xác thực bằng thật hay giả.</p>
     *
     * <p>Ví dụ: {@code "DEG-2026-0001"}</p>
     */
    @Property()
    private final String degreeId;

    /**
     * Loại văn bằng được cấp.
     *
     * <p>Ví dụ: {@code "Cử nhân"}, {@code "Kỹ sư"}, {@code "Thạc sĩ"}</p>
     */
    @Property()
    private final String degreeType;

    /**
     * Trạng thái tốt nghiệp của sinh viên.
     *
     * <p>Các giá trị hợp lệ:</p>
     * <ul>
     *   <li>{@code "GRADUATED"} — Đã tốt nghiệp</li>
     *   <li>{@code "NOT_GRADUATED"} — Chưa tốt nghiệp</li>
     *   <li>{@code "PENDING"} — Đang chờ xét duyệt</li>
     * </ul>
     */
    @Property()
    private final String graduationStatus;

    /**
     * Ngày tốt nghiệp chính thức theo định dạng {@code yyyy-MM-dd}.
     *
     * <p>Ví dụ: {@code "2026-05-21"}</p>
     */
    @Property()
    private final String graduationDate;

    /**
     * Năm tốt nghiệp.
     *
     * <p>Dùng để lọc và thống kê theo niên khóa.
     * Ví dụ: {@code "2026"}</p>
     */
    @Property()
    private final String graduationYear;

    /**
     * Xếp loại tốt nghiệp dựa trên GPA.
     *
     * <p>Các giá trị thường gặp theo chuẩn Việt Nam:</p>
     * <ul>
     *   <li>{@code "Excellent"} — Xuất sắc (GPA ≥ 3.60)</li>
     *   <li>{@code "Very Good"} — Giỏi (GPA 3.20 – 3.59)</li>
     *   <li>{@code "Good"} — Khá (GPA 2.50 – 3.19)</li>
     *   <li>{@code "Average"} — Trung bình (GPA 2.00 – 2.49)</li>
     * </ul>
     */
    @Property()
    private final String classification;

    /**
     * Điểm trung bình tích lũy (GPA) theo thang điểm 4.0.
     *
     * <p>Lưu dạng String để tránh lỗi làm tròn số thực (floating point).
     * Ví dụ: {@code "3.45"}</p>
     */
    @Property()
    private final String gpa;

    /**
     * Tổng số tín chỉ tích lũy trong toàn bộ chương trình đào tạo.
     *
     * <p>Dùng để xác nhận sinh viên đã hoàn thành đủ yêu cầu chương trình.
     * Ví dụ: {@code "150"}</p>
     */
    @Property()
    private final String totalCredits;

    /**
     * Năm nhập học của sinh viên.
     *
     * <p>Kết hợp với {@code graduationYear} để xác định niên khóa
     * và kiểm tra thời gian đào tạo hợp lệ.
     * Ví dụ: {@code "2022"}</p>
     */
    @Property()
    private final String entranceYear;

    // =========================================================
    // PHẦN 4 — Bảo mật & Blockchain
    // =========================================================

    /**
     * Mã băm SHA-256 của toàn bộ metadata sinh viên.
     *
     * <p><b>Mục đích:</b> Đảm bảo tính toàn vẹn dữ liệu (Data Integrity).
     * Hash được tính từ tất cả các trường dữ liệu trước khi ghi lên ledger.
     * Khi cần xác thực, hệ thống hash lại rồi so sánh — nếu khớp thì
     * dữ liệu chưa bị chỉnh sửa.</p>
     *
     * <p>Ví dụ: {@code "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d906"}</p>
     */
    @Property()
    private final String metadataHash;

    /**
     * Chữ ký số của người đại diện trường cấp bằng.
     *
     * <p><b>Mục đích:</b> Chứng minh bằng do trường hợp lệ cấp, không bị giả mạo.
     * Được tạo bằng cách ký {@code metadataHash} với private key của tổ chức.
     * Bên thứ ba dùng public key của trường để xác minh chữ ký này.</p>
     *
     * <p>Ví dụ: {@code "0xA3F2...E91C"}</p>
     */
    @Property()
    private final String issuerSignature;

    /**
     * MSP ID (Membership Service Provider) của tổ chức trên Hyperledger Fabric.
     *
     * <p><b>Mục đích:</b> Định danh node của trường trong consortium blockchain.
     * Chaincode dùng trường này để kiểm tra chỉ tổ chức hợp lệ
     * mới được phép ghi dữ liệu lên ledger.</p>
     *
     * <p>Ví dụ: {@code "FPTUniversityMSP"}</p>
     */
    @Property()
    private final String organizationMsp;

    /**
     * Thời điểm bản ghi được ghi chính thức lên Hyperledger Fabric Ledger (UTC).
     *
     * <p><b>Bất biến (Immutable):</b> Trường này KHÔNG được cập nhật sau khi
     * transaction đã được commit. Mọi thay đổi sau đó sẽ tạo block mới,
     * không xóa block cũ.</p>
     *
     * <p>Ví dụ: {@code "2026-05-26T10:05:00Z"}</p>
     */
    @Property()
    private final String ledgerTimestamp;

    /**
     * Thời điểm bản ghi được tạo lần đầu trong hệ thống (UTC).
     *
     * <p>Ví dụ: {@code "2026-05-26T10:00:00Z"}</p>
     */
    @Property()
    private final String createdAt;

    /**
     * Thời điểm bản ghi được cập nhật lần cuối trong hệ thống (UTC).
     *
     * <p>Lưu ý: Mỗi lần cập nhật trên blockchain thực chất là tạo
     * một transaction mới, không xóa dữ liệu cũ.</p>
     *
     * <p>Ví dụ: {@code "2026-05-26T10:00:00Z"}</p>
     */
    @Property()
    private final String updatedAt;

    // =========================================================
    // CONSTRUCTOR
    // =========================================================

    /**
     * Khởi tạo đối tượng {@code Student} với đầy đủ 23 trường dữ liệu.
     *
     * <p>Sử dụng {@code @JsonCreator} để Genson (thư viện JSON của Fabric)
     * có thể deserialize JSON từ ledger thành đối tượng Java này.</p>
     *
     * @param studentId          Mã sinh viên
     * @param fullName           Họ và tên
     * @param dateOfBirth        Ngày sinh (yyyy-MM-dd)
     * @param citizenIdHash      Hash SHA-256 của số CCCD
     * @param institutionCode    Mã trường
     * @param institutionName    Tên trường
     * @param facultyName        Tên khoa
     * @param major              Ngành học
     * @param degreeId           Mã văn bằng
     * @param degreeType         Loại văn bằng
     * @param graduationStatus   Trạng thái tốt nghiệp
     * @param graduationDate     Ngày tốt nghiệp (yyyy-MM-dd)
     * @param graduationYear     Năm tốt nghiệp
     * @param classification     Xếp loại tốt nghiệp
     * @param gpa                Điểm trung bình tích lũy
     * @param totalCredits       Tổng số tín chỉ tích lũy
     * @param entranceYear       Năm nhập học
     * @param metadataHash       Hash SHA-256 của toàn bộ metadata
     * @param issuerSignature    Chữ ký số của người cấp bằng
     * @param organizationMsp    MSP ID của tổ chức trên Fabric
     * @param ledgerTimestamp    Thời điểm ghi lên ledger (UTC)
     * @param createdAt          Thời điểm tạo bản ghi (UTC)
     * @param updatedAt          Thời điểm cập nhật lần cuối (UTC)
     */
    @JsonCreator
    public Student(
            @JsonProperty("studentId") final String studentId,
            @JsonProperty("fullName") final String fullName,
            @JsonProperty("dateOfBirth") final String dateOfBirth,
            @JsonProperty("citizenIdHash") final String citizenIdHash,
            @JsonProperty("institutionCode") final String institutionCode,
            @JsonProperty("institutionName") final String institutionName,
            @JsonProperty("facultyName") final String facultyName,
            @JsonProperty("major") final String major,
            @JsonProperty("degreeId") final String degreeId,
            @JsonProperty("degreeType") final String degreeType,
            @JsonProperty("graduationStatus") final String graduationStatus,
            @JsonProperty("graduationDate") final String graduationDate,
            @JsonProperty("graduationYear") final String graduationYear,
            @JsonProperty("classification") final String classification,
            @JsonProperty("gpa") final String gpa,
            @JsonProperty("totalCredits") final String totalCredits,
            @JsonProperty("entranceYear") final String entranceYear,
            @JsonProperty("metadataHash") final String metadataHash,
            @JsonProperty("issuerSignature") final String issuerSignature,
            @JsonProperty("organizationMsp") final String organizationMsp,
            @JsonProperty("ledgerTimestamp") final String ledgerTimestamp,
            @JsonProperty("createdAt") final String createdAt,
            @JsonProperty("updatedAt") final String updatedAt) {
        this.studentId = studentId;
        this.fullName = fullName;
        this.dateOfBirth = dateOfBirth;
        this.citizenIdHash = citizenIdHash;
        this.institutionCode = institutionCode;
        this.institutionName = institutionName;
        this.facultyName = facultyName;
        this.major = major;
        this.degreeId = degreeId;
        this.degreeType = degreeType;
        this.graduationStatus = graduationStatus;
        this.graduationDate = graduationDate;
        this.graduationYear = graduationYear;
        this.classification = classification;
        this.gpa = gpa;
        this.totalCredits = totalCredits;
        this.entranceYear = entranceYear;
        this.metadataHash = metadataHash;
        this.issuerSignature = issuerSignature;
        this.organizationMsp = organizationMsp;
        this.ledgerTimestamp = ledgerTimestamp;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    // =========================================================
    // GETTERS
    // =========================================================

    /** @return Mã sinh viên */
    public String getStudentId() { return studentId; }

    /** @return Họ và tên sinh viên */
    public String getFullName() { return fullName; }

    /** @return Ngày sinh (yyyy-MM-dd) */
    public String getDateOfBirth() { return dateOfBirth; }

    /** @return Hash SHA-256 của số CCCD */
    public String getCitizenIdHash() { return citizenIdHash; }

    /** @return Mã trường */
    public String getInstitutionCode() { return institutionCode; }

    /** @return Tên trường */
    public String getInstitutionName() { return institutionName; }

    /** @return Tên khoa */
    public String getFacultyName() { return facultyName; }

    /** @return Ngành học */
    public String getMajor() { return major; }

    /** @return Mã văn bằng */
    public String getDegreeId() { return degreeId; }

    /** @return Loại văn bằng */
    public String getDegreeType() { return degreeType; }

    /** @return Trạng thái tốt nghiệp */
    public String getGraduationStatus() { return graduationStatus; }

    /** @return Ngày tốt nghiệp (yyyy-MM-dd) */
    public String getGraduationDate() { return graduationDate; }

    /** @return Năm tốt nghiệp */
    public String getGraduationYear() { return graduationYear; }

    /** @return Xếp loại tốt nghiệp */
    public String getClassification() { return classification; }

    /** @return Điểm trung bình tích lũy */
    public String getGpa() { return gpa; }

    /** @return Tổng số tín chỉ tích lũy */
    public String getTotalCredits() { return totalCredits; }

    /** @return Năm nhập học */
    public String getEntranceYear() { return entranceYear; }

    /** @return Hash SHA-256 của toàn bộ metadata */
    public String getMetadataHash() { return metadataHash; }

    /** @return Chữ ký số của người cấp bằng */
    public String getIssuerSignature() { return issuerSignature; }

    /** @return MSP ID của tổ chức trên Fabric */
    public String getOrganizationMsp() { return organizationMsp; }

    /** @return Thời điểm ghi lên ledger (UTC) */
    public String getLedgerTimestamp() { return ledgerTimestamp; }

    /** @return Thời điểm tạo bản ghi (UTC) */
    public String getCreatedAt() { return createdAt; }

    /** @return Thời điểm cập nhật lần cuối (UTC) */
    public String getUpdatedAt() { return updatedAt; }
}
